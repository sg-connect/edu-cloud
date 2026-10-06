import { WorkRepository } from "../projects/database/src/work-cases";
import { runCase } from "../projects/backend/src/work-cases";
import { handleApi } from "../projects/backend/src/api";
import { caseInput, caseReport, learningSource } from "./work-case-fixtures";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { runJob, splitChapter } from "../projects/backend/src/jobs";
import { analyzeChapter, ProviderError } from "../projects/backend/src/ai";
import { Repository } from "../projects/database/src/index";
let mf: Miniflare, repo: Repository;
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: "2026-10-04",
      d1Databases: ["DB"],
      r2Buckets: ["BOOKS"],
    }),
  );
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("projects/database/migrations")).sort()) {
    const schema = await readFile(
      `projects/database/migrations/${file}`,
      "utf8",
    );
    const statements = [
      ...schema.matchAll(/\s*(CREATE TRIGGER[\s\S]*?END;|[^;]+;)/g),
    ].map((match) => match[1]);
    await db.batch(statements.map((sql) => db.prepare(sql)));
  }
  repo = new Repository(db);
});
afterAll(async () => {
  await mf?.dispose();
});
describe("D1 persistence and job ownership", () => {
  it("deduplicates concurrent claims and ignores a stale worker result", async () => {
    await repo.createBook(
      {
        id: "b1",
        title: "test",
        filename: "test.pdf",
        page_count: 2,
        object_key: "pdf",
        pages_key: "pages",
      },
      [{ title: "Chapter", start_page: 1, end_page: 2 }],
    );
    const chapters = await repo.chapters("b1");
    const id = String(chapters.results[0].id);
    await repo.queueJob("j1", id, 1, "test");
    await repo.queueJob("j1", id, 1, "test");
    const claims = await Promise.all([
      repo.claim("j1", "worker-a"),
      repo.claim("j1", "worker-b"),
    ]);
    expect(claims.reduce((n, r) => n + r.meta.changes, 0)).toBe(1);
    const winner = claims[0].meta.changes ? "worker-a" : "worker-b";
    await repo.finishJob("j1", "stale-token", {
      content: { overview: "stale" },
      model: "test",
      input_tokens: 1,
      output_tokens: 1,
    });
    expect(await repo.analysis(id, 1)).toBeNull();
    await repo.finishJob("j1", winner, {
      content: { overview: "current" },
      model: "test",
      input_tokens: 1,
      output_tokens: 1,
    });
    expect(JSON.parse((await repo.analysis(id, 1))!.content).overview).toBe(
      "current",
    );
    expect((await repo.claim("j1", "duplicate")).meta.changes).toBe(0);
    await repo.queueJob("j1", id, 1, "test");
    expect((await repo.chapter(id))?.status).toBe("ready");
  });
  it("persists notes and deduplicates saved principles; deletion cascades", async () => {
    const c = (await repo.chapters("b1")).results[0];
    const id = String(c.id);
    await repo.saveNote(id, "First note");
    await repo.saveNote(id, "Updated note");
    expect((await repo.note(id))?.content).toBe("Updated note");
    const p = { title: "Invariant", explanation: "Use a constraint", page: 1 };
    await repo.savePrinciple("architecture", id, p);
    await repo.savePrinciple("architecture", id, p);
    expect((await repo.trackItems()).results).toHaveLength(1);
    expect(await repo.outlineLocked("b1")).toBe(true);
    await repo.deleteBook("b1");
    expect((await repo.trackItems()).results).toHaveLength(0);
    expect(await repo.note(id)).toBeNull();
    expect(await repo.analysis(id, 1)).toBeNull();
  });
});

it("processes a large chapter in resumable sections without losing text or citations", async () => {
  const pages = Array.from({ length: 5 }, (_, i) => ({
    page: i + 10,
    text: "Original sample about safe database retries. ".repeat(600),
  }));
  const sections = splitChapter(pages);
  expect(sections).toHaveLength(3);
  expect(
    sections
      .flat()
      .map((p) => p.text)
      .join(""),
  ).toBe(pages.map((p) => p.text).join(""));
  expect(
    sections.every((s) => s.reduce((n, p) => n + p.text.length, 0) <= 65000),
  ).toBe(true);
  await repo.createBook(
    {
      id: "large",
      title: "Large",
      filename: "sample.pdf",
      page_count: 14,
      object_key: "pdf",
      pages_key: "large-pages",
    },
    [{ title: "Large chapter", start_page: 10, end_page: 14 }],
  );
  const chapter = String((await repo.chapters("large")).results[0].id);
  await repo.queueJob("large-job", chapter, 1, "test");
  const bucket = await mf.getR2Bucket("BOOKS");
  await bucket.put("large-pages", JSON.stringify(pages));
  const send = vi.fn().mockResolvedValue(undefined);
  const env = {
    DB: await mf.getD1Database("DB"),
    BOOKS: bucket,
    JOBS: { send },
    OPENAI_API_KEY: "fixture",
    OPENAI_MODEL: "test",
  } as Parameters<typeof runJob>[0];
  const analyze = vi
    .fn<typeof analyzeChapter>()
    .mockImplementation(async (_key, model, _title, source) => ({
      model,
      input_tokens: 10,
      output_tokens: 20,
      content: {
        overview: `Section starting at ${source[0].page}`,
        principles: [
          {
            title: "Retries",
            explanation: "Use identity",
            application: "Use a key",
            tradeoff: "Storage",
            page: source[0].page,
            evidence: source[0].text.slice(0, 60),
          },
        ],
        questions: ["What if delivery repeats?"],
      },
    }));
  await runJob(env, "large-job", analyze);
  expect(analyze).toHaveBeenCalledTimes(1);
  expect(await repo.analysis(chapter, 1)).toBeNull();
  expect((await repo.analysisParts("large-job", "test")).results).toHaveLength(
    1,
  );
  analyze.mockRejectedValueOnce(new ProviderError("fixture failure"));
  await runJob(env, "large-job", analyze);
  expect((await repo.chapter(chapter))?.status).toBe("failed");
  await repo.queueJob("large-job", chapter, 1, "test");
  await runJob(env, "large-job", analyze);
  await runJob(env, "large-job", analyze);
  expect(analyze).toHaveBeenCalledTimes(4);
  const result = (await repo.analysis(chapter, 1))!;
  expect(
    JSON.parse(result.content).principles.map((p: { page: number }) => p.page),
  ).toEqual([10, 12, 14]);
  expect(result.input_tokens).toBe(30);
  expect(result.output_tokens).toBe(60);
  await runJob(env, "large-job", analyze);
  expect(analyze).toHaveBeenCalledTimes(4);
  expect(
    (await repo.saveAnalysisPart("large-job", "stale", 0, "test", {})).meta
      .changes,
  ).toBe(0);
  await repo.deleteBook("large");
  expect((await repo.analysisParts("large-job", "test")).results).toHaveLength(
    0,
  );
});

it("persists work cases, retrieves learning, deduplicates jobs and rejects stale reviews", async () => {
  const db = await mf.getD1Database("DB");
  const cases = new WorkRepository(db);
  await repo.createBook(
    {
      id: "case-book",
      title: "Original notes",
      filename: "fixture.pdf",
      page_count: 7,
      object_key: "pdf",
      pages_key: "pages",
    },
    [{ title: "Retries", start_page: 1, end_page: 7 }],
  );
  const chapter = String((await repo.chapters("case-book")).results[0].id);
  await repo.queueJob("source-job", chapter, 1, "fixture");
  await repo.claim("source-job", "source-token");
  await repo.finishJob("source-job", "source-token", {
    model: "fixture",
    input_tokens: 1,
    output_tokens: 1,
    content: {
      overview: "Reliable queue workers",
      principles: [
        {
          title: learningSource.title,
          explanation: learningSource.text,
          application: "Use a key",
          tradeoff: "Storage",
          page: 7,
          evidence: learningSource.evidence,
        },
      ],
      questions: [],
    },
  });
  await repo.savePrinciple("reliability", chapter, {
    title: learningSource.title,
    explanation: learningSource.text,
    page: 7,
  });
  await repo.saveNote(
    chapter,
    "Check the database constraint before deploying.",
  );
  const sources = (await cases.sources()).results;
  expect(sources.filter((s) => s.chapter_id === chapter)).toHaveLength(3);
  expect(
    sources.find((s) => s.kind === "principle" && s.chapter_id === chapter)
      ?.saved,
  ).toBe(1);
  await cases.create("case-one", caseInput);
  await cases.queue("case-one", 1, "fixture");
  const env = {
    DB: db,
    BOOKS: await mf.getR2Bucket("BOOKS"),
    JOBS: { send: vi.fn() },
    OPENAI_API_KEY: "fixture",
    OPENAI_MODEL: "fixture",
  } as Parameters<typeof runCase>[0];
  const analyze = vi.fn().mockResolvedValue(caseReport);
  await Promise.all([
    runCase(env, "case-one", 1, analyze),
    runCase(env, "case-one", 1, analyze),
  ]);
  expect(analyze).toHaveBeenCalledTimes(1);
  expect((await cases.get("case-one"))?.status).toBe("ready");
  expect(
    JSON.parse((await cases.get("case-one"))!.result!).content.summary,
  ).toBe(caseReport.content.summary);
  await cases.queue("case-one", 1, "fixture");
  await cases.claim("case-one", 1, "old-token");
  expect(
    (
      await cases.update("case-one", 1, {
        ...caseInput,
        proposed_solution: "Use a unique operation key.",
      })
    ).meta.changes,
  ).toBe(2);
  expect((await cases.update("case-one", 1, caseInput)).meta.changes).toBe(0);
  expect(
    (await cases.finish("case-one", 1, "old-token", caseReport)).meta.changes,
  ).toBe(0);
  expect((await cases.get("case-one"))?.revision).toBe(2);
  expect((await cases.get("case-one"))?.analyzed_revision).toBe(1);
  const response = await handleApi(
    new Request("http://localhost:3400/api/work-cases/case-one", {
      method: "PUT",
      headers: {
        origin: "http://localhost:3400",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...caseInput, revision: 1 }),
    }),
    { ...env, APP_MODE: "local" } as BackendEnv,
  );
  expect(response.status).toBe(409);
  await cases.queue("case-one", 2, "fixture");
  await cases.claim("case-one", 2, "removed-token");
  await cases.delete("case-one");
  expect(
    (await cases.finish("case-one", 2, "removed-token", caseReport)).meta
      .changes,
  ).toBe(0);
  await repo.deleteBook("case-book");
});

it("retains saved approaches and every completed review as immutable learning history", async () => {
  const cases = new WorkRepository(await mf.getD1Database("DB"));
  await cases.create("history-case", caseInput);
  await cases.queue("history-case", 1, "fixture");
  await cases.claim("history-case", 1, "first");
  await cases.finish("history-case", 1, "first", caseReport);
  await cases.queue("history-case", 1, "fixture");
  await cases.claim("history-case", 1, "second");
  await cases.finish("history-case", 1, "second", {
    ...caseReport,
    content: { ...caseReport.content, summary: "A second perspective" },
  });
  await cases.update("history-case", 1, {
    ...caseInput,
    proposed_solution: "Use a stable job identity and a unique constraint.",
  });
  const rows = (await cases.history("history-case")).results;
  expect(rows.map((r) => r.kind)).toEqual([
    "saved",
    "review",
    "review",
    "saved",
  ]);
  expect(rows.map((r) => r.revision)).toEqual([2, 1, 1, 1]);
  const original = await cases.historyEntry("history-case", String(rows[3].id));
  expect(original?.proposed_solution).toBe(caseInput.proposed_solution);
  const first = await cases.historyEntry("history-case", String(rows[2].id));
  expect(JSON.parse(first!.result!).content.summary).toBe(
    caseReport.content.summary,
  );
  expect(
    await cases.historyEntry("different-case", String(rows[2].id)),
  ).toBeNull();
  await cases.finish("history-case", 1, "first", caseReport);
  expect((await cases.history("history-case")).results).toHaveLength(4);
  await cases.queue("history-case", 2, "fixture");
  await cases.claim("history-case", 2, "failed");
  await cases.fail("history-case", "failed", "Fixture failure");
  expect((await cases.history("history-case")).results[0].kind).toBe("failed");
  await cases.delete("history-case");
  expect((await cases.history("history-case")).results).toHaveLength(0);
});

it("lists completed current chapters across books and saves principles beyond the eighth", async () => {
  const db = await mf.getD1Database("DB");
  for (const id of ["index-a", "index-b", "index-unread"]) {
    await repo.createBook(
      {
        id,
        title: id,
        filename: "sample.pdf",
        page_count: 2,
        object_key: "pdf",
        pages_key: "pages",
      },
      [{ title: `Chapter ${id}`, start_page: 1, end_page: 2 }],
    );
  }
  const principles = Array.from({ length: 10 }, (_, i) => ({
    title: `Principle ${i + 1}`,
    explanation: "Use stable identity",
    application: "Database uniqueness",
    tradeoff: "Storage",
    page: 1,
    evidence: "A unique constraint protects against races.",
  }));
  for (const id of ["index-a", "index-b"]) {
    const c = String((await repo.chapters(id)).results[0].id);
    await repo.queueJob(id, c, 1, "fixture");
    await repo.claim(id, "token");
    await repo.finishJob(id, "token", {
      model: "fixture",
      input_tokens: 1,
      output_tokens: 1,
      content: { overview: "Retries", principles, questions: [] },
    });
  }
  const rows = (await repo.analyzedChapters()).results.filter((r) =>
    String(r.book_id).startsWith("index-"),
  );
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.principle_count === 10)).toBe(true);
  const c = String(rows.find((r) => r.book_id === "index-a")!.id);
  const env = { DB: db, APP_MODE: "local" } as BackendEnv;
  const saved = await handleApi(
    new Request("http://localhost:3400/api/tracks/reliability/items", {
      method: "POST",
      headers: {
        origin: "http://localhost:3400",
        "content-type": "application/json",
      },
      body: JSON.stringify({ chapterId: c, principleIndex: 8 }),
    }),
    env,
  );
  expect(saved.status).toBe(200);
  expect(
    (await repo.analyzedChapters()).results.find((r) => r.id === c)
      ?.saved_count,
  ).toBe(1);
  const response = await handleApi(
    new Request("http://localhost:3400/api/analyzed"),
    env,
  );
  expect(response.status).toBe(200);
  await db.prepare("UPDATE chapters SET version=2 WHERE id=?").bind(c).run();
  expect((await repo.analyzedChapters()).results.some((r) => r.id === c)).toBe(
    false,
  );
  for (const id of ["index-a", "index-b", "index-unread"])
    await repo.deleteBook(id);
  expect(
    (await repo.analyzedChapters()).results.some((r) =>
      String(r.book_id).startsWith("index-"),
    ),
  ).toBe(false);
});

import { ExamplesRepository } from "../projects/database/src/examples";
import { runExamples } from "../projects/backend/src/examples";
import {
  exampleSnapshotFixture,
  exampleResearchFixture,
  exampleReportFixture,
} from "./example-fixtures";
it("checkpoints example research, retries synthesis, deduplicates workers and protects deleted runs", async () => {
  const db = await mf.getD1Database("DB"),
    examples = new ExamplesRepository(db);
  const env = {
    DB: db,
    BOOKS: await mf.getR2Bucket("BOOKS"),
    OPENAI_API_KEY: "test",
    OPENAI_MODEL: "test",
    APP_MODE: "local",
    JOBS: { send: vi.fn().mockResolvedValue(undefined) },
  } as unknown as BackendEnv;
  const research = vi.fn().mockResolvedValue(exampleResearchFixture),
    write = vi
      .fn()
      .mockRejectedValueOnce(new ProviderError("Try again"))
      .mockResolvedValue({
        result: exampleReportFixture,
        input_tokens: 5,
        output_tokens: 6,
      });
  await examples.create("examples-test", exampleSnapshotFixture, 3, "test");
  await Promise.all([
    runExamples(env, "examples-test", research, write),
    runExamples(env, "examples-test", research, write),
  ]);
  expect(research).toHaveBeenCalledTimes(1);
  expect(write).not.toHaveBeenCalled();
  expect((await examples.get("examples-test"))?.stage).toBe("examples");
  await runExamples(env, "examples-test", research, write);
  expect((await examples.get("examples-test"))?.status).toBe("failed");
  await examples.retry("examples-test");
  await runExamples(env, "examples-test", research, write);
  expect(research).toHaveBeenCalledTimes(1);
  expect((await examples.get("examples-test"))?.status).toBe("ready");
  expect((await examples.get("examples-test"))?.input_tokens).toBe(15);
  await runExamples(env, "examples-test", research, write);
  expect(write).toHaveBeenCalledTimes(2);
  await examples.create("delete-test", exampleSnapshotFixture, 3, "test");
  await examples.claim("delete-test", "owner");
  await examples.delete("delete-test");
  expect(
    (await examples.finish("delete-test", "owner", exampleReportFixture, 0, 0))
      .meta.changes,
  ).toBe(0);
  const request = (body: unknown) =>
    new Request("http://localhost/api/examples", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  await repo.createBook(
    {
      id: "example-api-book",
      title: "Original test",
      filename: "test.pdf",
      page_count: 1,
      object_key: "none",
      pages_key: "none",
    },
    [{ title: "Chapter", start_page: 1, end_page: 1 }],
  );
  expect(
    (
      await handleApi(
        request({
          id: crypto.randomUUID(),
          book_id: "example-api-book",
          chapter_ids: ["foreign-chapter"],
          count: 3,
        }),
        env,
      )
    ).status,
  ).toBe(400);
  const chapter = (await repo.chapters("example-api-book")).results[0];
  await repo.queueJob("example-analysis", chapter.id, 1, "test");
  await repo.claim("example-analysis", "owner");
  await repo.finishJob("example-analysis", "owner", {
    content: {
      overview: "Original sample",
      principles: [
        { title: "Retries", explanation: "Use stable identity", page: 1 },
      ],
    },
    model: "test",
    input_tokens: 0,
    output_tokens: 0,
  });
  const body = {
    id: crypto.randomUUID(),
    book_id: "example-api-book",
    chapter_ids: [chapter.id],
    count: 3,
  };
  expect((await handleApi(request(body), env)).status).toBe(201);
  expect((await handleApi(request(body), env)).status).toBe(201);
  expect((await handleApi(request({ ...body, count: 5 }), env)).status).toBe(
    409,
  );
  await repo.deleteBook("example-api-book");
  expect(JSON.parse((await examples.get(body.id))!.snapshot).book_title).toBe(
    "Original test",
  );
});
