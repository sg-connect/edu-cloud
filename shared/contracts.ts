import { z } from "zod";

export const MAX_PDF_MB = 100;
export const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;
export function pdfSizeError(bytes: number) {
  return `This PDF is ${(bytes / (1024 * 1024)).toFixed(1)} MB. The current upload limit is ${MAX_PDF_MB} MB.`;
}
export const MAX_PAGES = 600;
export const MAX_CHAPTER_CHARS = 65000;
export const pageSchema = z.object({
  page: z.number().int().min(1).max(MAX_PAGES),
  text: z.string().max(30000),
});
export const chapterInput = z.object({
  title: z.string().trim().min(1).max(180),
  start_page: z.number().int().positive(),
  end_page: z.number().int().positive(),
});
export const uploadSchema = z.object({
  title: z.string().trim().min(1).max(180),
  pages: z.array(pageSchema).min(1).max(MAX_PAGES),
  chapters: z.array(chapterInput).min(1).max(100),
});
export const principleSchema = z.object({
  title: z.string().min(1).max(180),
  explanation: z.string().min(1).max(2400),
  application: z.string().max(1800),
  tradeoff: z.string().max(1800),
  page: z.number().int().positive(),
  evidence: z.string().min(4).max(250),
});
export const analysisSchema = z.object({
  overview: z.string().min(1).max(5000),
  principles: z.array(principleSchema).min(1).max(8),
  questions: z.array(z.string().max(800)).min(1).max(5),
});
export type Analysis = z.infer<typeof analysisSchema>;
export type Principle = z.infer<typeof principleSchema>;
export type PageText = z.infer<typeof pageSchema>;
export type ChapterInput = z.infer<typeof chapterInput>;
export interface Book {
  id: string;
  title: string;
  filename: string;
  page_count: number;
  created_at: string;
  chapter_count: number;
  analyzed_count: number;
}
export interface Chapter extends ChapterInput {
  id: string;
  book_id: string;
  position: number;
  version: number;
  status: string | null;
  error: string | null;
}
export interface TrackItem {
  id: string;
  track_id: string;
  chapter_id: string;
  title: string;
  explanation: string;
  page: number;
  completed: number;
  book_title: string;
  book_id: string;
}
export interface Track {
  id: string;
  title: string;
  description: string;
  items: TrackItem[];
}
export interface AnalysisRecord {
  content: Analysis;
  model: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}
export interface ChapterDetail {
  chapter: Chapter;
  pages: PageText[];
  analysis: AnalysisRecord | null;
  note: string;
}

export function validateChapters(chapters: ChapterInput[], pageCount: number) {
  let previousEnd = 0;
  for (const c of chapters) {
    if (
      c.start_page <= previousEnd ||
      c.end_page < c.start_page ||
      c.end_page > pageCount
    )
      throw new Error(
        "Chapter ranges must be ordered, non-overlapping, and inside the PDF.",
      );
    previousEnd = c.end_page;
  }
}
const normalize = (text: string) =>
  text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
export function validateEvidence(analysis: Analysis, pages: PageText[]) {
  for (const principle of analysis.principles) {
    const source = pages.find((p) => p.page === principle.page);
    if (
      !source ||
      !normalize(source.text).includes(normalize(principle.evidence))
    )
      throw new Error(
        "The analysis included a citation that could not be verified. Please retry.",
      );
  }
  return analysis;
}
