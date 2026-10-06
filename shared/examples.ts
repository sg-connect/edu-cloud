import { z } from "zod";
export const examplesInput = z.object({
  id: z.string().uuid(),
  book_id: z.string().min(1).max(100),
  chapter_ids: z.array(z.string().min(1).max(100)).min(1).max(100),
  count: z.union([z.literal(3), z.literal(5)]),
});
export interface ExamplePrinciple {
  id: string;
  title: string;
  explanation: string;
  page: number;
}
export interface ExampleChapter {
  id: string;
  title: string;
  overview: string;
  principles: ExamplePrinciple[];
}
export interface ExampleSnapshot {
  book_id: string;
  book_title: string;
  chapters: ExampleChapter[];
  total_principles: number;
  included_principles: number;
}
const example = z.object({
  title: z.string().min(1).max(180),
  kind: z.enum(["documented", "illustrative"]),
  problem: z.string().min(1).max(1800),
  decision: z.string().min(1).max(1800),
  outcome: z.string().min(1).max(1800),
  connection: z.string().min(1).max(1800),
  tradeoff: z.string().min(1).max(1200),
  try_it: z.string().min(1).max(1600),
  principle_ids: z.array(z.string()).min(1).max(6),
  source_urls: z.array(z.string()).max(5),
});
export const examplesReportSchema = z.object({
  summary: z.string().min(1).max(2500),
  examples: z.array(example).min(3).max(5),
});
export type ExamplesReport = z.infer<typeof examplesReportSchema>;
export interface ResearchSource {
  url: string;
  title: string;
}
export interface ExampleResearch {
  text: string;
  sources: ResearchSource[];
  input_tokens: number;
  output_tokens: number;
}
export interface ExampleRun {
  id: string;
  book_title: string;
  example_count: 3 | 5;
  status: "queued" | "running" | "ready" | "failed";
  stage: "research" | "examples";
  model: string;
  error: string | null;
  created_at: string;
  snapshot: ExampleSnapshot;
  result: ExamplesReport | null;
  sources: ResearchSource[];
  input_tokens: number;
  output_tokens: number;
}
