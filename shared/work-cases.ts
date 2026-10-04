import { z } from "zod";
export const workCaseInput = z.object({
  title: z.string().trim().min(1).max(180),
  context: z.string().trim().min(40).max(24000),
  proposed_solution: z.string().max(12000).default(""),
});
export type WorkCaseInput = z.infer<typeof workCaseInput>;
const advice = z.object({
  title: z.string().min(1).max(180),
  detail: z.string().min(1).max(2400),
  source_ids: z.array(z.string()).max(6),
});
export const caseReportSchema = z.object({
  summary: z.string().min(1).max(3000),
  approach: z.array(advice).min(1).max(8),
  risks: z.array(advice).max(8),
  solution_review: z.object({
    strengths: z.array(advice).max(6),
    concerns: z.array(advice).max(6),
    revised_solution: z.string().max(6000),
  }),
  questions: z.array(z.string().max(800)).max(8),
});
export interface LearningSource {
  id: string;
  chapter_id: string;
  book_id: string;
  book_title: string;
  chapter_title: string;
  title: string;
  kind: "principle" | "analysis" | "note";
  page: number;
  text: string;
  evidence: string | null;
  saved: number;
}
export interface CaseReport {
  content: z.infer<typeof caseReportSchema>;
  sources: LearningSource[];
  coverage: { searched: number; selected: number };
  model: string;
  input_tokens: number;
  output_tokens: number;
}
export interface WorkCase extends WorkCaseInput {
  id: string;
  revision: number;
  analyzed_revision: number | null;
  status: "draft" | "queued" | "running" | "ready" | "failed";
  error: string | null;
  result: CaseReport | null;
  created_at: string;
  updated_at: string;
}

export interface CaseHistoryEntry {
  id: number;
  kind: "saved" | "review" | "failed";
  revision: number;
  created_at: string;
  error: string | null;
  title?: string;
  context?: string | null;
  proposed_solution?: string | null;
  result?: CaseReport | null;
}
