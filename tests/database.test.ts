import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import { Repository } from "../projects/database/src/index";
let mf: Miniflare, repo: Repository;
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: "2026-10-04",
      d1Databases: ["DB"],
    }),
  );
  const db = await mf.getD1Database("DB");
  const schema = await readFile(
    "projects/database/migrations/0001_library.sql",
    "utf8",
  );
  await db.batch(
    schema
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => db.prepare(s)),
  );
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
