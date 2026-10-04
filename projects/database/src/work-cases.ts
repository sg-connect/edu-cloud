import type {
  LearningSource,
  WorkCaseInput,
  WorkCase,
  CaseReport,
} from "../../../shared/work-cases";
export type StoredWorkCase = Omit<WorkCase, "result"> & {
  result: string | null;
  model: string;
  lease_until: number | null;
};
export class WorkRepository {
  constructor(private db: D1Database) {}
  list() {
    return this.db
      .prepare(
        "SELECT id,title,status,revision,analyzed_revision,created_at,updated_at FROM work_cases ORDER BY updated_at DESC,id",
      )
      .all();
  }
  get(id: string) {
    return this.db
      .prepare("SELECT * FROM work_cases WHERE id=?")
      .bind(id)
      .first<StoredWorkCase>();
  }
  create(id: string, data: WorkCaseInput) {
    return this.db
      .prepare(
        "INSERT INTO work_cases(id,title,context,proposed_solution) VALUES(?,?,?,?)",
      )
      .bind(id, data.title, data.context, data.proposed_solution)
      .run();
  }
  update(id: string, revision: number, data: WorkCaseInput) {
    return this.db
      .prepare(
        "UPDATE work_cases SET title=?,context=?,proposed_solution=?,revision=revision+1,status='draft',error=NULL,lease_token=NULL,lease_until=NULL,dispatched_at=NULL,updated_at=datetime('now') WHERE id=? AND revision=?",
      )
      .bind(data.title, data.context, data.proposed_solution, id, revision)
      .run();
  }
  delete(id: string) {
    return this.db.prepare("DELETE FROM work_cases WHERE id=?").bind(id).run();
  }
  queue(id: string, revision: number, model: string) {
    return this.db
      .prepare(
        "UPDATE work_cases SET status='queued',model=?,error=NULL,dispatched_at=NULL,lease_token=NULL,lease_until=NULL,updated_at=datetime('now') WHERE id=? AND revision=? AND (status NOT IN ('running','queued') OR (status='running' AND lease_until<?))",
      )
      .bind(model, id, revision, Date.now())
      .run();
  }
  pending() {
    return this.db
      .prepare(
        "SELECT id,revision,attempts FROM work_cases WHERE status='queued' AND dispatched_at IS NULL LIMIT 10",
      )
      .all<{ id: string; revision: number; attempts: number }>();
  }
  dispatched(id: string, revision: number, attempts: number) {
    return this.db
      .prepare(
        "UPDATE work_cases SET dispatched_at=? WHERE id=? AND revision=? AND attempts=? AND status='queued'",
      )
      .bind(Date.now(), id, revision, attempts)
      .run();
  }
  claim(id: string, revision: number, token: string) {
    return this.db
      .prepare(
        "UPDATE work_cases SET status='running',lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND revision=? AND (status='queued' OR (status='running' AND lease_until<?))",
      )
      .bind(token, Date.now() + 180000, id, revision, Date.now())
      .run();
  }
  finish(id: string, revision: number, token: string, result: CaseReport) {
    return this.db
      .prepare(
        "UPDATE work_cases SET result=?,analyzed_revision=?,status='ready',lease_token=NULL,lease_until=NULL,error=NULL,updated_at=datetime('now') WHERE id=? AND revision=? AND lease_token=? AND status='running'",
      )
      .bind(JSON.stringify(result), revision, id, revision, token)
      .run();
  }
  fail(id: string, token: string, error: string) {
    return this.db
      .prepare(
        "UPDATE work_cases SET status='failed',error=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
      )
      .bind(error, id, token)
      .run();
  }
  expire() {
    return this.db
      .prepare(
        "UPDATE work_cases SET status='failed',error='Review was interrupted. Retry this case.',lease_token=NULL WHERE status='running' AND lease_until<?",
      )
      .bind(Date.now())
      .run();
  }
  sources() {
    return this.db
      .prepare(
        `
      SELECT c.id || ':p:' || p.key id,c.id chapter_id,b.id book_id,b.title book_title,c.title chapter_title,
        json_extract(p.value,'$.title') title,'principle' kind,json_extract(p.value,'$.page') page,
        json_extract(p.value,'$.explanation') || '\nApplication: ' || json_extract(p.value,'$.application') || '\nTradeoff: ' || json_extract(p.value,'$.tradeoff') text,
        json_extract(p.value,'$.evidence') evidence,
        EXISTS(SELECT 1 FROM track_items t WHERE t.chapter_id=c.id AND t.title=json_extract(p.value,'$.title')) saved
      FROM analyses a JOIN chapters c ON c.id=a.chapter_id AND c.version=a.chapter_version JOIN books b ON b.id=c.book_id, json_each(a.content,'$.principles') p
      UNION ALL
      SELECT c.id || ':overview',c.id,b.id,b.title,c.title,c.title,'analysis',c.start_page,json_extract(a.content,'$.overview'),NULL,0
      FROM analyses a JOIN chapters c ON c.id=a.chapter_id AND c.version=a.chapter_version JOIN books b ON b.id=c.book_id
      UNION ALL
      SELECT c.id || ':note',c.id,b.id,b.title,c.title,'My notes: ' || c.title,'note',c.start_page,n.content,NULL,0
      FROM notes n JOIN chapters c ON c.id=n.chapter_id JOIN books b ON b.id=c.book_id WHERE length(trim(n.content))>0
      ORDER BY id
    `,
      )
      .all<LearningSource>();
  }
}
