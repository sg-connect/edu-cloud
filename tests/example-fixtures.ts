import type {
  ExampleSnapshot,
  ExampleResearch,
  ExamplesReport,
} from "../shared/examples";
export const exampleSnapshotFixture: ExampleSnapshot = {
  book_id: "sample-book",
  book_title: "Original reliability notes",
  chapters: [
    {
      id: "sample-chapter",
      title: "Retries",
      overview: "Use stable operation identities.",
      principles: [
        {
          id: "sample-chapter:0",
          title: "Idempotent operations",
          explanation: "A repeated request should not duplicate its effect.",
          page: 1,
        },
      ],
    },
  ],
  total_principles: 1,
  included_principles: 1,
};
export const exampleResearchFixture: ExampleResearch = {
  text: "An original test research summary.",
  sources: [
    { url: "https://example.com/engineering", title: "Engineering evidence" },
  ],
  input_tokens: 10,
  output_tokens: 20,
};
export const exampleReportFixture: ExamplesReport = {
  summary: "Three hypothetical exercises; these are not real incidents.",
  examples: Array.from({ length: 3 }, (_, i) => ({
    title: `Retry scenario ${i + 1}`,
    kind: "illustrative" as const,
    problem: "A payment request times out.",
    decision: "Attach a stable request identifier.",
    outcome:
      "In this hypothetical system, retrying returns the previous result.",
    connection: "A stable identity makes retries safe.",
    tradeoff: "Keys require retention and clear scope.",
    try_it: "Write a test that submits the same request twice.",
    principle_ids: ["sample-chapter:0"],
    source_urls: [],
  })),
};
