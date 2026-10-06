import { reviewCase, selectSources } from "../projects/backend/src/work-cases";
import { caseInput, caseReport, learningSource } from "./work-case-fixtures";
import { describe, it, expect, vi } from "vitest";
import { guardLocal } from "../projects/backend/src/api";
import { analyzeChapter, sourceExcerpts } from "../projects/backend/src/ai";
import {
  validateEvidence,
  validateChapters,
  type Analysis,
} from "../shared/contracts";
const pages = [
  {
    page: 1,
    text: "A database constraint is stronger than checking for an existing row in application code.",
  },
];
const valid: Analysis = {
  overview: "Use database constraints for concurrency.",
  principles: [
    {
      title: "Persist invariants",
      explanation: "A constraint protects against races.",
      application: "Use a unique key.",
      tradeoff: "Choose the right key.",
      page: 1,
      evidence: "A database constraint is stronger",
    },
  ],
  questions: ["What happens when two workers race?"],
};
describe("source-grounded analysis", () => {
  it("accepts citations present in the supplied page and rejects fabricated pages or text", () => {
    expect(validateEvidence(valid, pages)).toEqual(valid);
    expect(() =>
      validateEvidence(
        { ...valid, principles: [{ ...valid.principles[0], page: 2 }] },
        pages,
      ),
    ).toThrow();
    expect(() =>
      validateEvidence(
        {
          ...valid,
          principles: [
            { ...valid.principles[0], evidence: "an invented quotation" },
          ],
        },
        pages,
      ),
    ).toThrow();
  });
  it("preserves exact PDF typography and absolute page numbers in bounded excerpts", () => {
    const text =
      "A ligature ﬁ, curly ‘quotes’, and hyphen-\nated PDF text. ".repeat(20);
    const excerpts = sourceExcerpts([{ page: 42, text }]);
    expect(excerpts.length).toBeGreaterThan(1);
    expect(new Set(excerpts.map((e) => e.id)).size).toBe(excerpts.length);
    for (const excerpt of excerpts) {
      expect(excerpt.page).toBe(42);
      expect(excerpt.text.length).toBeLessThanOrEqual(180);
      expect(text.includes(excerpt.text)).toBe(true);
    }
  });
  it("rejects overlapping chapter ranges", () => {
    expect(() =>
      validateChapters(
        [
          { title: "A", start_page: 1, end_page: 3 },
          { title: "B", start_page: 3, end_page: 4 },
        ],
        4,
      ),
    ).toThrow();
  });
  it("uses structured outputs, disables response storage, and validates the response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  ...valid,
                  principles: valid.principles.map(
                    ({ page, evidence, ...p }) => ({ ...p, source_id: "p1e1" }),
                  ),
                }),
              },
            ],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 80 },
      }),
    );
    const result = await analyzeChapter(
      "fixture-key",
      "fixture-model",
      "Constraints",
      pages,
      fetcher,
    );
    expect(result.content).toEqual({
      ...valid,
      principles: [{ ...valid.principles[0], evidence: pages[0].text }],
    });
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.input).toContain(pages[0].text);
  });
  it("does not expose a provider error body or key", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { message: "secret-provider-detail" } },
          { status: 401 },
        ),
      );
    await expect(
      analyzeChapter("fixture-key", "model", "title", pages, fetcher),
    ).rejects.toThrow("OpenAI rejected the API key");
  });
  it("does not publish incomplete responses or unsupported citations", async () => {
    const incomplete = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ status: "incomplete" }));
    await expect(
      analyzeChapter("key", "model", "title", pages, incomplete),
    ).rejects.toThrow("did not finish");
    const bad = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  ...valid,
                  principles: [{ ...valid.principles[0], source_id: "p99e1" }],
                }),
              },
            ],
          },
        ],
      }),
    );
    await expect(
      analyzeChapter("key", "model", "title", pages, bad),
    ).rejects.toThrow("citations");
  });
});
describe("local access boundary", () => {
  it("rejects cross-site mutations and hosted access", () => {
    expect(() =>
      guardLocal(
        new Request("http://localhost:3400/api/books", {
          method: "POST",
          headers: { origin: "https://attacker.example" },
        }),
        "local",
      ),
    ).toThrow("Cross-origin");
    expect(() =>
      guardLocal(new Request("https://example.workers.dev/api/books"), "local"),
    ).toThrow("restricted");
    expect(() =>
      guardLocal(
        new Request("http://localhost:3400/api/books", { method: "POST" }),
        "local",
      ),
    ).toThrow("same-origin");
    expect(() =>
      guardLocal(
        new Request("http://localhost:3400/api/books", {
          method: "POST",
          headers: { origin: "http://localhost:3400" },
        }),
        "local",
      ),
    ).not.toThrow();
  });
});

describe("work case reviews", () => {
  it("ranks learning material, bounds context, and does not invent matches", () => {
    const sources = Array.from({ length: 100 }, (_, i) => ({
      ...learningSource,
      id: `p${i}`,
      text: learningSource.text.repeat(200),
    }));
    const selected = selectSources(caseInput, sources);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.length).toBeLessThanOrEqual(24);
    expect(JSON.stringify(selected).length).toBeLessThan(49000);
    expect(
      selectSources(
        {
          title: "Gardening",
          context: "orchids sunshine",
          proposed_solution: "",
        },
        [learningSource],
      ),
    ).toEqual([]);
  });
  it("includes the proposal and validates source IDs without exposing provider details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify(caseReport.content),
              },
            ],
          },
        ],
        usage: { input_tokens: 20, output_tokens: 30 },
      }),
    );
    const result = await reviewCase(
      "fixture",
      "fixture",
      caseInput,
      [learningSource],
      fetcher,
    );
    expect(result.content.solution_review.concerns).toHaveLength(1);
    expect(result.sources).toEqual([learningSource]);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.store).toBe(false);
    expect(body.input).toContain(caseInput.proposed_solution);
    expect(body.text.format.strict).toBe(true);
    fetcher.mockResolvedValueOnce(
      Response.json({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  ...caseReport.content,
                  approach: [
                    {
                      ...caseReport.content.approach[0],
                      source_ids: ["fabricated"],
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    );
    await expect(
      reviewCase("fixture", "fixture", caseInput, [learningSource], fetcher),
    ).rejects.toThrow("outside the selected");
    fetcher.mockResolvedValueOnce(
      Response.json({ error: "private provider detail" }, { status: 500 }),
    );
    await expect(
      reviewCase("fixture", "fixture", caseInput, [], fetcher),
    ).rejects.toThrow("OpenAI review failed (500)");
  });
  it("allows explicitly uncited general advice when no relevant learning exists", async () => {
    const content = {
      ...caseReport.content,
      approach: [{ ...caseReport.content.approach[0], source_ids: [] }],
      risks: [],
      solution_review: { strengths: [], concerns: [], revised_solution: "" },
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          {
            content: [{ type: "output_text", text: JSON.stringify(content) }],
          },
        ],
      }),
    );
    const result = await reviewCase(
      "fixture",
      "fixture",
      { ...caseInput, proposed_solution: "" },
      [],
      fetcher,
    );
    expect(result.coverage).toEqual({ searched: 0, selected: 0 });
    expect(result.content.approach[0].source_ids).toEqual([]);
  });
});

import {
  researchExamples,
  writeExamples,
  publicSourceUrl,
  exampleSnapshot,
} from "../projects/backend/src/examples";
import {
  exampleSnapshotFixture,
  exampleResearchFixture,
  exampleReportFixture,
} from "./example-fixtures";
describe("real-world example grounding", () => {
  const response = (report: unknown) =>
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          status: "completed",
          output: [
            {
              content: [{ type: "output_text", text: JSON.stringify(report) }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 2 },
        }),
      );
  it("accepts explicit hypothetical examples and validates count, principle IDs and researched URLs", async () => {
    const generate = (report: unknown, count = 3) =>
      writeExamples(
        "test",
        "test",
        exampleSnapshotFixture,
        count,
        exampleResearchFixture,
        response(report),
      );
    expect((await generate(exampleReportFixture)).result.examples).toHaveLength(
      3,
    );
    await expect(generate(exampleReportFixture, 5)).rejects.toThrow("number");
    for (const patch of [
      { principle_ids: ["invented"] },
      { kind: "documented", source_urls: [] },
      { kind: "documented", source_urls: ["https://invented.example/case"] },
      { source_urls: ["https://example.com/engineering"] },
    ]) {
      const report = structuredClone(exampleReportFixture);
      Object.assign(report.examples[0], patch);
      await expect(generate(report)).rejects.toThrow();
    }
    const report = structuredClone(exampleReportFixture);
    report.examples[0].kind = "documented";
    report.examples[0].source_urls = ["https://example.com/engineering"];
    expect((await generate(report)).result.examples[0].kind).toBe("documented");
  });
  it("requires tool-supplied public sources and requests web search without provider storage", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          status: "completed",
          output: [
            {
              type: "web_search_call",
              action: {
                sources: [
                  { url: "https://example.com/engineering", title: "Evidence" },
                  { url: "http://localhost/private" },
                ],
              },
            },
            {
              content: [
                { type: "output_text", text: "Evidence from research" },
              ],
            },
          ],
        }),
      );
    expect(
      (
        await researchExamples(
          "test",
          "test",
          exampleSnapshotFixture,
          3,
          fetcher,
        )
      ).sources,
    ).toHaveLength(1);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.store).toBe(false);
    expect(body.tools).toEqual([{ type: "web_search" }]);
    expect(body.tool_choice).toBe("required");
    await expect(
      researchExamples("test", "test", exampleSnapshotFixture, 3, response({})),
    ).rejects.toThrow("source links");
    for (const url of [
      "javascript:alert(1)",
      "https://127.0.0.1/a",
      "https://user:pass@example.com/a",
      "https://machine.local/a",
    ])
      expect(publicSourceUrl(url)).toBeNull();
  });
  it("represents every selected chapter and reports bounded principle coverage", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      title: "Chapter",
      content: JSON.stringify({
        ...valid,
        principles: Array.from({ length: 20 }, () => ({
          ...valid.principles[0],
          explanation: "x".repeat(1000),
        })),
      }),
    }));
    const snapshot = exampleSnapshot("b", "Book", rows);
    expect(snapshot.chapters).toHaveLength(100);
    expect(snapshot.chapters.every((c) => c.principles.length > 0)).toBe(true);
    expect(snapshot.total_principles).toBe(2000);
    expect(snapshot.included_principles).toBeLessThan(2000);
  });
});
