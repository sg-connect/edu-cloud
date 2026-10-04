export interface AnalyzedChapter {
  id: string;
  book_id: string;
  title: string;
  book_title: string;
  start_page: number;
  end_page: number;
  analyzed_at: string;
  principle_count: number;
  saved_count: number;
}
