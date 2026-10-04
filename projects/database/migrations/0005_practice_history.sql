CREATE TABLE case_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL REFERENCES work_cases(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('saved','review','failed')),
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  context TEXT,
  proposed_solution TEXT,
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX case_history_case ON case_history(case_id,id);
INSERT INTO case_history(case_id,kind,revision,title,context,proposed_solution,created_at)
SELECT id,'saved',revision,title,context,proposed_solution,updated_at FROM work_cases;
INSERT INTO case_history(case_id,kind,revision,title,context,proposed_solution,result,created_at)
SELECT id,'review',analyzed_revision,title,
  CASE WHEN analyzed_revision=revision THEN context ELSE NULL END,
  CASE WHEN analyzed_revision=revision THEN proposed_solution ELSE NULL END,
  result,updated_at FROM work_cases WHERE result IS NOT NULL AND analyzed_revision IS NOT NULL;
CREATE TRIGGER case_history_created AFTER INSERT ON work_cases BEGIN
  INSERT INTO case_history(case_id,kind,revision,title,context,proposed_solution)
  VALUES(NEW.id,'saved',NEW.revision,NEW.title,NEW.context,NEW.proposed_solution);
END;
CREATE TRIGGER case_history_edited AFTER UPDATE OF revision ON work_cases
WHEN NEW.revision != OLD.revision BEGIN
  INSERT INTO case_history(case_id,kind,revision,title,context,proposed_solution)
  VALUES(NEW.id,'saved',NEW.revision,NEW.title,NEW.context,NEW.proposed_solution);
END;
CREATE TRIGGER case_history_reviewed AFTER UPDATE OF status ON work_cases
WHEN NEW.status='ready' AND OLD.status='running' BEGIN
  INSERT INTO case_history(case_id,kind,revision,title,context,proposed_solution,result)
  VALUES(NEW.id,'review',NEW.revision,NEW.title,NEW.context,NEW.proposed_solution,NEW.result);
END;
CREATE TRIGGER case_history_failed AFTER UPDATE OF status ON work_cases
WHEN NEW.status='failed' AND OLD.status!='failed' BEGIN
  INSERT INTO case_history(case_id,kind,revision,title,context,proposed_solution,error)
  VALUES(NEW.id,'failed',NEW.revision,NEW.title,NEW.context,NEW.proposed_solution,NEW.error);
END;
