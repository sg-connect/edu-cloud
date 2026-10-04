import { describe, it, expect, vi } from "vitest";
import { guardLocal } from "../projects/backend/src/api";
import { analyzeChapter } from "../projects/backend/src/ai";
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
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({
          status: "completed",
          output: [
            { content: [{ type: "output_text", text: JSON.stringify(valid) }] },
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
    expect(result.content).toEqual(valid);
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
    const bad = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({
          status: "completed",
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    ...valid,
                    principles: [{ ...valid.principles[0], page: 99 }],
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
