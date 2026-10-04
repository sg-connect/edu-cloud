CREATE TABLE analysis_parts (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  part_index INTEGER NOT NULL, model TEXT NOT NULL, result TEXT NOT NULL,
  PRIMARY KEY(job_id, part_index)
);
