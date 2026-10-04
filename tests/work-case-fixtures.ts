import type {
  LearningSource,
  CaseReport,
  WorkCaseInput,
} from "../shared/work-cases";
export const caseInput: WorkCaseInput = {
  title: "Reliable export queue",
  context:
    "Our export service uses a database and workers. Retried jobs must not duplicate customer exports. We need a safe rollout.",
  proposed_solution:
    "Check for an existing row, then insert and run the export.",
};
export const learningSource: LearningSource = {
  id: "chapter:p:0",
  chapter_id: "chapter",
  book_id: "book",
  book_title: "Original engineering notes",
  chapter_title: "Retries",
  title: "Enforce database uniqueness",
  kind: "principle",
  page: 7,
  text: "A unique database constraint protects against races when queue workers retry.",
  evidence: "A unique constraint protects against races.",
  saved: 1,
};
export const caseReport: CaseReport = {
  content: {
    summary: "Use durable job identity and database uniqueness.",
    approach: [
      {
        title: "Define job identity",
        detail:
          "Persist a unique operation key before processing. Test concurrent retries.",
        source_ids: [learningSource.id],
      },
    ],
    risks: [
      {
        title: "Concurrent inserts",
        detail: "A prior check alone can race.",
        source_ids: [learningSource.id],
      },
    ],
    solution_review: {
      strengths: [
        {
          title: "Checking existing work",
          detail: "You identified duplicate work as a risk.",
          source_ids: [],
        },
      ],
      concerns: [
        {
          title: "Check then insert race",
          detail:
            "Two workers may observe no row. Enforce uniqueness in the database.",
          source_ids: [learningSource.id],
        },
      ],
      revised_solution:
        "Add a unique operation key, handle conflicts, then test retry and rollback behavior.",
    },
    questions: ["What identifies one logical export?"],
  },
  sources: [learningSource],
  coverage: { searched: 1, selected: 1 },
  model: "fixture",
  input_tokens: 20,
  output_tokens: 30,
};
