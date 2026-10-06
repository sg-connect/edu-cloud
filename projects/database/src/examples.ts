import type {
  ExampleSnapshot,
  ExampleResearch,
  ExamplesReport,
} from "../../../shared/examples";
export interface StoredExampleRun {
  id: string;
  book_title: string;
  snapshot: string;
  example_count: 3 | 5;
  model: string;
  status: string;
  stage: string;
  research: string | null;
  result: string | null;
  error: string | null;
  created_at: string;
  input_tokens: number;
  output_tokens: number;
}
export class ExamplesRepository {
  constructor(private db: D1Database) {}
  analyzed(bookId: string) {
    return this.db
      .prepare(
        "SELECT c.id,c.title,a.content FROM chapters c JOIN analyses a ON a.chapter_id=c.id AND a.chapter_version=c.version WHERE c.book_id=? ORDER BY c.position",
      )
      .bind(bookId)
      .all<{ id: string; title: string; content: string }>();
  }
  create(id: string, snapshot: ExampleSnapshot, count: 3 | 5, model: string) {
    return this.db
      .prepare(
        "INSERT INTO example_runs(id,book_title,snapshot,example_count,model) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
      )
      .bind(id, snapshot.book_title, JSON.stringify(snapshot), count, model)
      .run();
  }
  list() {
    return this.db
      .prepare(
        "SELECT id,book_title,example_count,status,stage,model,error,created_at FROM example_runs ORDER BY created_at DESC,rowid DESC",
      )
      .all();
  }
  get(id: string) {
    return this.db
      .prepare("SELECT * FROM example_runs WHERE id=?")
      .bind(id)
      .first<StoredExampleRun>();
  }
  pending() {
    return this.db
      .prepare(
        "SELECT id,attempts FROM example_runs WHERE status='queued' AND dispatched_at IS NULL LIMIT 10",
      )
      .all<{ id: string; attempts: number }>();
  }
  dispatched(id: string, attempts: number) {
    return this.db
      .prepare(
        "UPDATE example_runs SET dispatched_at=? WHERE id=? AND attempts=? AND status='queued'",
      )
      .bind(Date.now(), id, attempts)
      .run();
  }
  claim(id: string, token: string) {
    return this.db
      .prepare(
        "UPDATE example_runs SET status='running',lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND (status='queued' OR (status='running' AND lease_until<?))",
      )
      .bind(token, Date.now() + 180000, id, Date.now())
      .run();
  }
  research(id: string, token: string, research: ExampleResearch) {
    return this.db
      .prepare(
        "UPDATE example_runs SET research=?,stage='examples',status='queued',dispatched_at=NULL,lease_token=NULL,lease_until=NULL,input_tokens=?,output_tokens=? WHERE id=? AND lease_token=? AND status='running'",
      )
      .bind(
        JSON.stringify(research),
        research.input_tokens,
        research.output_tokens,
        id,
        token,
      )
      .run();
  }
  finish(
    id: string,
    token: string,
    result: ExamplesReport,
    input: number,
    output: number,
  ) {
    return this.db
      .prepare(
        "UPDATE example_runs SET result=?,status='ready',lease_token=NULL,lease_until=NULL,error=NULL,input_tokens=input_tokens+?,output_tokens=output_tokens+? WHERE id=? AND lease_token=? AND status='running'",
      )
      .bind(JSON.stringify(result), input, output, id, token)
      .run();
  }
  fail(id: string, token: string, error: string) {
    return this.db
      .prepare(
        "UPDATE example_runs SET status='failed',error=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
      )
      .bind(error, id, token)
      .run();
  }
  retry(id: string) {
    return this.db
      .prepare(
        "UPDATE example_runs SET status='queued',error=NULL,dispatched_at=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND (status='failed' OR (status='running' AND lease_until<?))",
      )
      .bind(id, Date.now())
      .run();
  }
  expire() {
    return this.db
      .prepare(
        "UPDATE example_runs SET status='failed',error='Research was interrupted. Retry this saved run.',lease_token=NULL WHERE status='running' AND lease_until<?",
      )
      .bind(Date.now())
      .run();
  }
  delete(id: string) {
    return this.db
      .prepare("DELETE FROM example_runs WHERE id=?")
      .bind(id)
      .run();
  }
}
