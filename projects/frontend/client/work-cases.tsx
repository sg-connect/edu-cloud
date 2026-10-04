"use client";
import { useEffect, useState, useId } from "react";
import {
  BriefcaseBusiness,
  Plus,
  ArrowLeft,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  WorkCase,
  WorkCaseInput,
  CaseReport,
  LearningSource,
  CaseHistoryEntry,
} from "../../../shared/work-cases";
async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const r = await fetch(`/api/work-cases${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(body.error || "Request failed.");
  return body;
}
const empty: WorkCaseInput = { title: "", context: "", proposed_solution: "" };
export default function WorkCases({
  configured,
  onSource,
}: {
  configured: boolean;
  onSource: (bookId: string, chapterId: string) => void;
}) {
  const [list, setList] = useState<WorkCase[]>([]),
    [selected, setSelected] = useState<string | null>(null);
  const [record, setRecord] = useState<WorkCase | null>(null),
    [draft, setDraft] = useState<WorkCaseInput>(empty);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const running = record?.status === "queued" || record?.status === "running";
  const dirty = record
    ? draft.title !== record.title ||
      draft.context !== record.context ||
      draft.proposed_solution !== record.proposed_solution
    : true;
  async function refresh() {
    setList(await api<WorkCase[]>(""));
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setRecord(null);
    setDraft(empty);
    setError("");
    setNotice("");
    if (!selected || selected === "new") return;
    let active = true;
    api<WorkCase>(`/${selected}`)
      .then((c) => {
        if (active) {
          setRecord(c);
          setDraft({
            title: c.title,
            context: c.context,
            proposed_solution: c.proposed_solution,
          });
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [selected]);
  useEffect(() => {
    if (!running || !selected) return;
    let active = true;
    const poll = setInterval(() => {
      api<WorkCase>(`/${selected}`)
        .then((c) => {
          if (active) setRecord(c);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 2000);
    return () => {
      active = false;
      clearInterval(poll);
    };
  }, [running, selected]);
  useEffect(() => {
    if (record?.status === "ready") setNotice("Review ready.");
    if (record?.status === "failed") setNotice("");
  }, [record?.status]);
  async function save() {
    if (record) {
      await api(`/${record.id}`, "PUT", {
        ...draft,
        revision: record.revision,
      });
      return await api<WorkCase>(`/${record.id}`);
    }
    const { id } = await api<{ id: string }>("", "POST", draft);
    return await api<WorkCase>(`/${id}`);
  }
  async function submit(analyze: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let saved = dirty ? await save() : record!;
      if (analyze) {
        await api(`/${saved.id}/analyze`, "POST", { revision: saved.revision });
        saved = await api<WorkCase>(`/${saved.id}`);
      }
      setSelected(saved.id);
      setRecord(saved);
      setDraft({
        title: saved.title,
        context: saved.context,
        proposed_solution: saved.proposed_solution,
      });
      setNotice(
        analyze
          ? "Review queued. You can leave this page and return later."
          : "Practice case saved.",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !record ||
      !window.confirm(
        `Delete “${record.title}” and its entire learning history?`,
      )
    )
      return;
    setBusy(true);
    try {
      await api(`/${record.id}`, "DELETE");
      setSelected(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="work-cases">
      <div className="section-heading">
        <div>
          <span className="eyebrow">FROM LEARNING TO PRACTICE</span>
          <h1>Practice cases</h1>
          <p>
            Learn from your engineering decisions and keep the story of how your
            thinking evolves.
          </p>
        </div>
        {!selected && (
          <button className="button primary" onClick={() => setSelected("new")}>
            <Plus size={16} />
            New practice case
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="case-notice">
          {notice}
        </p>
      )}
      {!selected ? (
        <div className="case-list">
          {list.length === 0 ? (
            <div className="empty">
              <BriefcaseBusiness size={32} />
              <h3>Your learning, applied.</h3>
              <p>
                Bring a task, an idea, or a decision you want to learn from. Add
                your current approach, explore suggestions from your reading,
                and revisit your saved history.
              </p>
            </div>
          ) : (
            list.map((c) => (
              <button
                className="case-list-item"
                key={c.id}
                onClick={() => setSelected(c.id)}
              >
                <strong>{c.title}</strong>
                <span>
                  {c.status} ·{" "}
                  {new Date(c.updated_at + "Z").toLocaleDateString()}
                </span>
              </button>
            ))
          )}
        </div>
      ) : (
        <>
          <button
            className="text-link"
            onClick={() => {
              setSelected(null);
              refresh().catch((e) => setError(e.message));
            }}
            disabled={busy}
          >
            <ArrowLeft size={15} />
            All practice cases
          </button>
          {(selected === "new" || record) && (
            <>
              <form
                className="case-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(false);
                }}
              >
                <label htmlFor="case-title">Case title</label>
                <input
                  id="case-title"
                  required
                  maxLength={180}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                  placeholder="For example: make our export pipeline reliable"
                  disabled={busy}
                />
                <label htmlFor="case-context">
                  Situation and engineering context
                </label>
                <p className="case-hint">
                  Describe the goal, current architecture, stack, relevant code,
                  constraints, team practices, and what success looks like.
                  Paste your prepared context here.
                </p>
                <textarea
                  id="case-context"
                  required
                  minLength={40}
                  maxLength={24000}
                  rows={12}
                  value={draft.context}
                  onChange={(e) =>
                    setDraft({ ...draft, context: e.target.value })
                  }
                  disabled={busy}
                />
                <small>
                  {draft.context.length.toLocaleString()} / 24,000 characters
                </small>
                <label htmlFor="case-solution">
                  My proposed solution (optional)
                </label>
                <p className="case-hint">
                  What would you change, and why? The review will identify
                  strengths, concerns, and a revised proposal.
                </p>
                <textarea
                  id="case-solution"
                  maxLength={12000}
                  rows={7}
                  value={draft.proposed_solution}
                  onChange={(e) =>
                    setDraft({ ...draft, proposed_solution: e.target.value })
                  }
                  disabled={busy}
                />
                <div className="case-actions">
                  <button
                    className="button secondary"
                    type="submit"
                    disabled={busy || !dirty}
                  >
                    Save case
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    disabled={
                      busy ||
                      !configured ||
                      !!running ||
                      draft.context.trim().length < 40 ||
                      !draft.title.trim()
                    }
                    onClick={() => submit(true)}
                  >
                    <Sparkles size={16} />
                    {running
                      ? "Analyzing practice case…"
                      : record?.result
                        ? "Analyze again"
                        : "Analyze practice case"}
                  </button>
                  {record && (
                    <button
                      type="button"
                      className="text-link"
                      disabled={busy}
                      onClick={remove}
                    >
                      <Trash2 size={15} />
                      Delete case
                    </button>
                  )}
                </div>
                <p className="provider-note">
                  Analyze sends this context, your proposed solution, and
                  selected learning material to OpenAI using your API key. Usage
                  is billed to your key. Saving alone does not call AI.
                </p>
                {running && (
                  <button
                    type="button"
                    className="text-link"
                    disabled={busy}
                    onClick={() => submit(true)}
                  >
                    Recover interrupted review
                  </button>
                )}
              </form>
              {record?.error && (
                <p className="alert" role="alert">
                  {record.error}
                </p>
              )}
              {record?.result && (
                <>
                  {(dirty || record.analyzed_revision !== record.revision) && (
                    <p className="alert subtle">
                      This review belongs to an earlier version. Analyze again
                      to review your changes.
                    </p>
                  )}
                  <Report report={record.result} onSource={onSource} />
                </>
              )}
              {record && (
                <PracticeHistory
                  key={record.id}
                  record={record}
                  onSource={onSource}
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
function Report({
  report,
  onSource,
}: {
  report: CaseReport;
  onSource: (bookId: string, chapterId: string) => void;
}) {
  const { content, sources } = report;
  const referencePrefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  function refs(ids: string[]) {
    return (
      <div className="case-refs">
        {ids.length ? (
          ids.map((id) => {
            const s = sources.find((s) => s.id === id);
            return s ? (
              <a
                key={id}
                href={`#case-source-${referencePrefix}-${encodeURIComponent(id)}`}
              >
                {s.title} · PDF p. {s.page}
              </a>
            ) : null;
          })
        ) : (
          <small>General engineering guidance</small>
        )}
      </div>
    );
  }
  function cards(
    title: string,
    items: { title: string; detail: string; source_ids: string[] }[],
  ) {
    return (
      items.length > 0 && (
        <section>
          <h3>{title}</h3>
          {items.map((item, i) => (
            <article className="case-advice" key={i}>
              <h4>{item.title}</h4>
              <p>{item.detail}</p>
              {refs(item.source_ids)}
            </article>
          ))}
        </section>
      )
    );
  }
  return (
    <div className="case-report">
      <span className="eyebrow">LEARNING GUIDANCE</span>
      <h2>Suggestions for your approach</h2>
      <p>{content.summary}</p>
      <p className="case-hint">
        Searched {report.coverage.searched} learning entries; selected{" "}
        {report.coverage.selected} relevant entries using keyword matching.
        Unanalyzed book text is not searched. References show provenance, not
        proof that a recommendation fits.
      </p>
      {cards("Approach to explore", content.approach)}
      {cards("Risks and tradeoffs", content.risks)}
      {cards("Your solution: strengths", content.solution_review.strengths)}
      {cards("Your solution: concerns", content.solution_review.concerns)}
      {content.solution_review.revised_solution && (
        <section>
          <h3>Revised solution</h3>
          <p>{content.solution_review.revised_solution}</p>
        </section>
      )}
      {content.questions.length > 0 && (
        <section>
          <h3>Questions to resolve</h3>
          <ul>
            {content.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      )}
      {sources.length > 0 && (
        <section>
          <h3>Learning material considered</h3>
          {sources.map((s) => (
            <Source
              key={s.id}
              source={s}
              onSource={onSource}
              referencePrefix={referencePrefix}
            />
          ))}
        </section>
      )}
    </div>
  );
}
function Source({
  source: s,
  onSource,
  referencePrefix,
}: {
  source: LearningSource;
  referencePrefix: string;
  onSource: (bookId: string, chapterId: string) => void;
}) {
  return (
    <details
      className="case-source"
      id={`case-source-${referencePrefix}-${encodeURIComponent(s.id)}`}
    >
      <summary>
        {s.title} · {s.kind}
        {s.saved ? " · saved principle" : ""}
      </summary>
      <p>{s.text}</p>
      {s.evidence && <blockquote>{s.evidence}</blockquote>}
      <button
        className="text-link"
        onClick={() => onSource(s.book_id, s.chapter_id)}
      >
        {s.book_title} / {s.chapter_title} · PDF p. {s.page}
      </button>
    </details>
  );
}

function PracticeHistory({
  record,
  onSource,
}: {
  record: WorkCase;
  onSource: (bookId: string, chapterId: string) => void;
}) {
  const [entries, setEntries] = useState<CaseHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState<Record<number, CaseHistoryEntry>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<CaseHistoryEntry[]>(`/${record.id}/history`)
      .then((rows) => {
        if (active) setEntries(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [record.id, record.revision, record.status, record.updated_at]);
  async function load(id: number) {
    if (loaded[id]) return;
    try {
      const entry = await api<CaseHistoryEntry>(`/${record.id}/history/${id}`);
      setLoaded((current) => ({ ...current, [id]: entry }));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="case-report case-history">
      <span className="eyebrow">YOUR LEARNING JOURNEY</span>
      <h2>Learning history</h2>
      <p>
        Every saved version and completed review stays here. Revisit your
        earlier approach and the guidance you received.
      </p>
      {error && <p role="alert">{error}</p>}
      {entries.map((row) => {
        const entry = loaded[row.id];
        return (
          <details
            key={row.id}
            className="case-source"
            onToggle={(e) => {
              if (e.currentTarget.open) void load(row.id);
            }}
          >
            <summary>
              {row.kind === "saved"
                ? "Saved approach"
                : row.kind === "review"
                  ? "Learning review"
                  : "Review failed"}{" "}
              · Version {row.revision} ·{" "}
              {new Date(row.created_at + "Z").toLocaleString()}
            </summary>
            {!entry ? (
              <p>Loading history…</p>
            ) : (
              <>
                <h3>{entry.title}</h3>
                {entry.context === null ? (
                  <p>
                    The original context for this older review was not retained
                    before history was introduced.
                  </p>
                ) : (
                  <>
                    <h4>Situation at the time</h4>
                    <p>{entry.context}</p>
                    <h4>My approach at the time</h4>
                    <p>
                      {entry.proposed_solution ||
                        "No proposed solution was added."}
                    </p>
                  </>
                )}
                {entry.error && <p>{entry.error}</p>}
                {entry.result && (
                  <Report report={entry.result} onSource={onSource} />
                )}
              </>
            )}
          </details>
        );
      })}
    </section>
  );
}
