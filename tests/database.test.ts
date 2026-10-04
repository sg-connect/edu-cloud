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
    await db.batch(
      schema
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s)),
    );
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
