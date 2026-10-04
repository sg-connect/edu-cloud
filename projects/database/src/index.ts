import type { ChapterInput } from "@edu/contracts";
export interface StoredBook {
  id: string;
  title: string;
  page_count: number;
  object_key: string;
  pages_key: string;
  upload_status: string;
  byte_count: number;
}
export interface StoredChapter {
  id: string;
  book_id: string;
  title: string;
  version: number;
  start_page: number;
  end_page: number;
  status: string | null;
  error: string | null;
}
export interface StoredAnalysis {
  content: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}
export class Repository {
  constructor(private db: D1Database) {}
  book(id: string) {
    return this.db
      .prepare("SELECT * FROM books WHERE id=?")
      .bind(id)
      .first<StoredBook>();
  }
  chapter(id: string) {
    return this.db
      .prepare(
        "SELECT c.*,j.status,j.error FROM chapters c LEFT JOIN jobs j ON j.chapter_id=c.id AND j.chapter_version=c.version WHERE c.id=?",
      )
      .bind(id)
      .first<StoredChapter>();
  }
  analyzedChapters() {
    return this.db
      .prepare(
        `SELECT c.id,c.book_id,c.title,b.title book_title,c.start_page,c.end_page,
      a.created_at analyzed_at,json_array_length(a.content,'$.principles') principle_count,
      (SELECT COUNT(DISTINCT t.title) FROM track_items t WHERE t.chapter_id=c.id) saved_count
      FROM analyses a JOIN chapters c ON c.id=a.chapter_id AND c.version=a.chapter_version
      JOIN books b ON b.id=c.book_id WHERE b.upload_status='ready'
      ORDER BY a.created_at DESC,b.title,c.position`,
      )
      .all();
  }
  listBooks() {
    return this.db
      .prepare(
        "SELECT b.*, (SELECT COUNT(*) FROM chapters c WHERE c.book_id=b.id) chapter_count, (SELECT COUNT(*) FROM chapters c JOIN analyses a ON a.chapter_id=c.id AND a.chapter_version=c.version WHERE c.book_id=b.id) analyzed_count FROM books b WHERE b.upload_status='ready' ORDER BY b.created_at DESC",
      )
      .all();
  }
  chapters(bookId: string) {
    return this.db
      .prepare(
        "SELECT c.*,j.status,j.error FROM chapters c LEFT JOIN jobs j ON j.chapter_id=c.id AND j.chapter_version=c.version WHERE c.book_id=? ORDER BY c.position",
      )
      .bind(bookId)
      .all();
  }
  createBook(
    book: Omit<StoredBook, "upload_status" | "byte_count"> & {
      filename: string;
      upload_status?: string;
      byte_count?: number;
    },
    chapters: ChapterInput[],
  ) {
    return this.db.batch([
      this.db
        .prepare(
          "INSERT INTO books(id,title,filename,page_count,object_key,pages_key,upload_status,byte_count) VALUES(?,?,?,?,?,?,?,?)",
        )
        .bind(
          book.id,
          book.title,
          book.filename,
          book.page_count,
          book.object_key,
          book.pages_key,
          book.upload_status ?? "ready",
          book.byte_count ?? 0,
        ),
      ...this.chapterStatements(book.id, chapters),
    ]);
  }
  private chapterStatements(bookId: string, chapters: ChapterInput[]) {
    return chapters.map((c, i) =>
      this.db
        .prepare(
          "INSERT INTO chapters(id,book_id,title,start_page,end_page,position) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          bookId,
          c.title,
          c.start_page,
          c.end_page,
          i,
        ),
    );
  }
  async outlineLocked(id: string) {
    const r = await this.db
      .prepare(
        "SELECT (SELECT COUNT(*) FROM chapters c JOIN jobs j ON j.chapter_id=c.id WHERE c.book_id=? AND j.status IN ('queued','running','ready')) + (SELECT COUNT(*) FROM chapters c JOIN notes n ON n.chapter_id=c.id WHERE c.book_id=? AND n.content<>'') total",
      )
      .bind(id, id)
      .first<{ total: number }>();
    return !!r?.total;
  }
  replaceChapters(id: string, chapters: ChapterInput[]) {
    return this.db.batch([
      this.db.prepare("DELETE FROM chapters WHERE book_id=?").bind(id),
      ...this.chapterStatements(id, chapters),
    ]);
  }
  finishUpload(id: string) {
    return this.db
      .prepare(
        "UPDATE books SET upload_status='ready' WHERE id=? AND upload_status='uploading'",
      )
      .bind(id)
      .run();
  }
  deleteBook(id: string) {
    return this.db.prepare("DELETE FROM books WHERE id=?").bind(id).run();
  }
  analysis(chapterId: string, version: number) {
    return this.db
      .prepare(
        "SELECT * FROM analyses WHERE chapter_id=? AND chapter_version=?",
      )
      .bind(chapterId, version)
      .first<StoredAnalysis>();
  }
  note(chapterId: string) {
    return this.db
      .prepare("SELECT content FROM notes WHERE chapter_id=?")
      .bind(chapterId)
      .first<{ content: string }>();
  }
  saveNote(id: string, content: string) {
    return this.db
      .prepare(
        "INSERT INTO notes(chapter_id,content) VALUES(?,?) ON CONFLICT(chapter_id) DO UPDATE SET content=excluded.content,updated_at=datetime('now')",
      )
      .bind(id, content)
      .run();
  }
  queueJob(id: string, chapterId: string, version: number, model: string) {
    return this.db
      .prepare(
        "INSERT INTO jobs(id,chapter_id,chapter_version,model,status) VALUES(?,?,?,?,'queued') ON CONFLICT(chapter_id,chapter_version) DO UPDATE SET status='queued',error=NULL,dispatched_at=NULL,lease_token=NULL,lease_until=NULL,model=excluded.model,updated_at=datetime('now') WHERE jobs.status='failed' OR (jobs.status='running' AND jobs.lease_until < ?)",
      )
      .bind(id, chapterId, version, model, Date.now())
      .run();
  }
  tracks() {
    return this.db
      .prepare("SELECT * FROM tracks ORDER BY created_at,title")
      .all<{ id: string; title: string; description: string }>();
  }
  trackItems() {
    return this.db
      .prepare(
        "SELECT i.*,b.title book_title,b.id book_id FROM track_items i JOIN chapters c ON c.id=i.chapter_id JOIN books b ON b.id=c.book_id ORDER BY i.created_at,i.rowid",
      )
      .all<{ track_id: string }>();
  }
  createTrack(id: string, title: string, description: string) {
    return this.db
      .prepare("INSERT INTO tracks(id,title,description) VALUES(?,?,?)")
      .bind(id, title, description)
      .run();
  }
  deleteTrack(id: string) {
    return this.db.prepare("DELETE FROM tracks WHERE id=?").bind(id).run();
  }
  track(id: string) {
    return this.db.prepare("SELECT id FROM tracks WHERE id=?").bind(id).first();
  }
  savePrinciple(
    trackId: string,
    chapterId: string,
    p: { title: string; explanation: string; page: number },
  ) {
    return this.db
      .prepare(
        "INSERT INTO track_items(id,track_id,chapter_id,title,explanation,page) VALUES(?,?,?,?,?,?) ON CONFLICT(track_id,chapter_id,title) DO NOTHING",
      )
      .bind(
        crypto.randomUUID(),
        trackId,
        chapterId,
        p.title,
        p.explanation,
        p.page,
      )
      .run();
  }
  completeItem(id: string, completed: boolean) {
    return this.db
      .prepare("UPDATE track_items SET completed=? WHERE id=?")
      .bind(completed ? 1 : 0, id)
      .run();
  }
  deleteItem(id: string) {
    return this.db.prepare("DELETE FROM track_items WHERE id=?").bind(id).run();
  }
  pendingJobs() {
    return this.db
      .prepare(
        "SELECT id,attempts FROM jobs WHERE status='queued' AND dispatched_at IS NULL LIMIT 10",
      )
      .all<{ id: string; attempts: number }>();
  }
  dispatched(id: string, attempts: number) {
    return this.db
      .prepare(
        "UPDATE jobs SET dispatched_at=? WHERE id=? AND status='queued' AND attempts=?",
      )
      .bind(Date.now(), id, attempts)
      .run();
  }
  claim(id: string, token: string) {
    return this.db
      .prepare(
        "UPDATE jobs SET status='running',lease_token=?,lease_until=?,attempts=attempts+1,updated_at=datetime('now') WHERE id=? AND (status='queued' OR (status='running' AND lease_until<?))",
      )
      .bind(token, Date.now() + 180000, id, Date.now())
      .run();
  }
  job(id: string) {
    return this.db
      .prepare(
        "SELECT j.*,c.title,c.start_page,c.end_page,b.pages_key FROM jobs j JOIN chapters c ON c.id=j.chapter_id AND c.version=j.chapter_version JOIN books b ON b.id=c.book_id WHERE j.id=?",
      )
      .bind(id)
      .first<{
        chapter_id: string;
        chapter_version: number;
        title: string;
        start_page: number;
        end_page: number;
        pages_key: string;
        model: string;
      }>();
  }
  analysisParts(id: string, model: string) {
    return this.db
      .prepare(
        "SELECT part_index,result FROM analysis_parts WHERE job_id=? AND model=? ORDER BY part_index",
      )
      .bind(id, model)
      .all<{ part_index: number; result: string }>();
  }
  saveAnalysisPart(
    id: string,
    token: string,
    index: number,
    model: string,
    result: unknown,
  ) {
    return this.db
      .prepare(
        "INSERT INTO analysis_parts(job_id,part_index,model,result) SELECT id,?,?,? FROM jobs WHERE id=? AND lease_token=? AND status='running' ON CONFLICT(job_id,part_index) DO UPDATE SET model=excluded.model,result=excluded.result",
      )
      .bind(index, model, JSON.stringify(result), id, token)
      .run();
  }
  continueJob(id: string, token: string) {
    return this.db
      .prepare(
        "UPDATE jobs SET status='queued',dispatched_at=NULL,lease_token=NULL,lease_until=NULL,updated_at=datetime('now') WHERE id=? AND lease_token=? AND status='running'",
      )
      .bind(id, token)
      .run();
  }
  finishJob(
    id: string,
    token: string,
    result: {
      content: unknown;
      model: string;
      input_tokens: number;
      output_tokens: number;
    },
  ) {
    return this.db.batch([
      this.db
        .prepare(
          "INSERT INTO analyses(id,chapter_id,chapter_version,content,model,input_tokens,output_tokens) SELECT id,chapter_id,chapter_version,?,?,?,? FROM jobs WHERE id=? AND lease_token=? AND status='running' ON CONFLICT(id) DO UPDATE SET content=excluded.content,model=excluded.model,input_tokens=excluded.input_tokens,output_tokens=excluded.output_tokens,created_at=datetime('now')",
        )
        .bind(
          JSON.stringify(result.content),
          result.model,
          result.input_tokens,
          result.output_tokens,
          id,
          token,
        ),
      this.db
        .prepare(
          "UPDATE jobs SET status='ready',error=NULL,lease_token=NULL,lease_until=NULL,updated_at=datetime('now') WHERE id=? AND lease_token=?",
        )
        .bind(id, token),
    ]);
  }
  failJob(id: string, token: string, error: string) {
    return this.db
      .prepare(
        "UPDATE jobs SET status='failed',error=?,lease_token=NULL,lease_until=NULL,updated_at=datetime('now') WHERE id=? AND lease_token=?",
      )
      .bind(error, id, token)
      .run();
  }
  expireJobs() {
    return this.db
      .prepare(
        "UPDATE jobs SET status='failed',error='Processing was interrupted. Retry this chapter.',lease_token=NULL WHERE status='running' AND lease_until<?",
      )
      .bind(Date.now())
      .run();
  }
}

export { WorkRepository } from "./work-cases";
