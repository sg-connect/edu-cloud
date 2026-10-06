"use client";
import { useEffect, useRef, useState } from "react";
import type { AnalyzedChapter } from "../../../shared/analyzed";
import type { ExampleRun } from "../../../shared/examples";
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(`/api/examples${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      (data as { error?: string }).error || "Could not load examples.",
    );
  return data as T;
}
export default function Examples({
  configured,
  onSource,
}: {
  configured: boolean;
  onSource: (bookId: string, chapterId: string) => void;
}) {
  const [chapters, setChapters] = useState<AnalyzedChapter[]>([]),
    [runs, setRuns] = useState<ExampleRun[]>([]),
    [book, setBook] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [count, setCount] = useState<3 | 5>(3),
    [active, setActive] = useState(""),
    [run, setRun] = useState<ExampleRun | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const pendingId = useRef<string | null>(null);
  const refresh = () => api<ExampleRun[]>("").then(setRuns);
  useEffect(() => {
    Promise.all([
      fetch("/api/analyzed").then(async (r) => {
        if (!r.ok) throw new Error("Could not load analyzed chapters.");
        setChapters(await r.json());
      }),
      refresh(),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!active) {
      setRun(null);
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setRun(null);
    const poll = async () => {
      try {
        const next = await api<ExampleRun>(`/${active}`);
        if (stopped) return;
        setRun(next);
        await refresh();
        if (next.status === "queued" || next.status === "running")
          timer = setTimeout(poll, 2500);
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active]);
  const books = [
    ...new Map(chapters.map((c) => [c.book_id, c.book_title])).entries(),
  ];
  async function generate() {
    setBusy(true);
    setError("");
    pendingId.current ??= crypto.randomUUID();
    try {
      const data = await api<{ id: string }>("", "POST", {
        id: pendingId.current,
        book_id: book,
        chapter_ids: selected,
        count,
      });
      pendingId.current = null;
      setActive(data.id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    if (!run) return;
    setBusy(true);
    setError("");
    try {
      await api(`/${run.id}/retry`, "POST");
      const id = run.id;
      setActive("");
      setTimeout(() => setActive(id), 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !run ||
      !confirm(
        "Delete this saved example run? Your books and chapter analyses will stay.",
      )
    )
      return;
    setBusy(true);
    try {
      await api(`/${run.id}`, "DELETE");
      setActive("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="examples-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">FROM PRINCIPLES TO PRACTICE</span>
          <h1>Real-world examples</h1>
          <p>
            See the problems a principle can solve—and the tradeoffs behind the
            decision.
          </p>
        </div>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <div className="examples-layout">
        <aside>
          <div className="example-panel">
            <h2>1. Choose your reading</h2>
            {loading ? (
              <p>Loading analyzed chapters…</p>
            ) : !books.length ? (
              <p>
                Analyze a chapter in your library first. Its principles will
                appear here.
              </p>
            ) : (
              <>
                <label>
                  Analyzed book
                  <select
                    aria-label="Analyzed book"
                    disabled={busy}
                    value={book}
                    onChange={(e) => {
                      setBook(e.target.value);
                      setSelected(
                        chapters
                          .filter((c) => c.book_id === e.target.value)
                          .map((c) => c.id),
                      );
                      pendingId.current = null;
                    }}
                  >
                    <option value="">Choose a book</option>
                    {books.map(([id, title]) => (
                      <option key={id} value={id}>
                        {title}
                      </option>
                    ))}
                  </select>
                </label>
                {book && (
                  <fieldset disabled={busy}>
                    <legend>Chapters · {selected.length} selected</legend>
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelected(
                          chapters
                            .filter((c) => c.book_id === book)
                            .map((c) => c.id),
                        );
                        pendingId.current = null;
                      }}
                    >
                      Select all
                    </button>
                    {chapters
                      .filter((c) => c.book_id === book)
                      .map((c) => (
                        <label className="example-checkbox" key={c.id}>
                          <input
                            type="checkbox"
                            checked={selected.includes(c.id)}
                            onChange={(e) => {
                              setSelected((prev) =>
                                e.target.checked
                                  ? [...prev, c.id]
                                  : prev.filter((id) => id !== c.id),
                              );
                              pendingId.current = null;
                            }}
                          />
                          <span>
                            {c.title}
                            <small>
                              {c.principle_count} principles · pp.{" "}
                              {c.start_page}–{c.end_page}
                            </small>
                          </span>
                        </label>
                      ))}
                  </fieldset>
                )}
                <label>
                  Number of examples
                  <select
                    aria-label="Number of examples"
                    disabled={busy}
                    value={count}
                    onChange={(e) => {
                      setCount(Number(e.target.value) as 3 | 5);
                      pendingId.current = null;
                    }}
                  >
                    <option value={3}>3 focused examples</option>
                    <option value={5}>5 broader examples</option>
                  </select>
                </label>
                <button
                  className="button primary"
                  disabled={!configured || !selected.length || busy}
                  onClick={generate}
                >
                  {busy ? "Starting…" : "Find real-world examples"}
                </button>
                <p className="example-note">
                  Uses your configured OpenAI model and web search. Summarized
                  chapter principles are sent to OpenAI; token and search
                  charges apply. Each run saves automatically.
                </p>
                {!configured && (
                  <p className="alert">
                    Add your OpenAI key to .env and restart the app.
                  </p>
                )}
              </>
            )}
          </div>
          <div className="example-panel">
            <h2>Saved runs</h2>
            {!loading && !runs.length && (
              <p>Your examples will be kept here for later.</p>
            )}
            <div className="example-history">
              {runs.map((r) => (
                <button
                  key={r.id}
                  className={active === r.id ? "selected" : ""}
                  onClick={() => {
                    setError("");
                    setActive(r.id);
                  }}
                >
                  <strong>{r.book_title}</strong>
                  <small>
                    {r.example_count} examples · {r.status} ·{" "}
                    {new Date(
                      r.created_at.replace(" ", "T") +
                        (/Z$/.test(r.created_at) ? "" : "Z"),
                    ).toLocaleDateString()}
                  </small>
                </button>
              ))}
            </div>
          </div>
        </aside>
        <div className="example-results" aria-live="polite">
          {!active ? (
            <div className="example-panel example-welcome">
              <span className="eyebrow">2. CONNECT THE DOTS</span>
              <h2>Understand the decision, not just the definition.</h2>
              <div className="example-steps">
                <div>
                  <b>01 / Problem</b>
                  <p>What broke or became difficult?</p>
                </div>
                <div>
                  <b>02 / Decision</b>
                  <p>What did engineers change, and why?</p>
                </div>
                <div>
                  <b>03 / Practice</b>
                  <p>How could you apply the principle?</p>
                </div>
              </div>
              <p>
                Choose chapters to research new examples, or open a saved run.
                Published cases include source links. Hypothetical scenarios are
                explicitly labeled.
              </p>
            </div>
          ) : !run ? (
            <div className="example-panel">Opening saved run…</div>
          ) : (
            <>
              <div className="example-panel">
                <div className="section-heading">
                  <h2>{run.book_title}</h2>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={remove}
                  >
                    Delete run
                  </button>
                </div>
                <p>{run.snapshot.chapters.map((c) => c.title).join(" · ")}</p>
                <p className="example-note">
                  {run.snapshot.included_principles} of{" "}
                  {run.snapshot.total_principles} principles included ·{" "}
                  {run.model}
                  {run.snapshot.included_principles <
                    run.snapshot.total_principles &&
                    " · A balanced subset was used to fit this run. Select fewer chapters for more detail."}
                </p>
                {run.status === "queued" || run.status === "running" ? (
                  <>
                    <h3>
                      {run.stage === "research"
                        ? "Researching published engineering cases…"
                        : "Connecting cases to your principles…"}
                    </h3>
                    <p>
                      You can leave this section and return to this saved run.
                    </p>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={retry}
                    >
                      Resume if interrupted
                    </button>
                  </>
                ) : run.status === "failed" ? (
                  <>
                    <p className="alert" role="alert">
                      {run.error}
                    </p>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={retry}
                    >
                      Retry saved run
                    </button>
                  </>
                ) : (
                  <>
                    <p>{run.result?.summary}</p>
                    <p className="example-note">
                      Principle connections are AI interpretations. Check the
                      linked sources before relying on reported outcomes.
                    </p>
                  </>
                )}
              </div>
              {run.status === "ready" &&
                run.result?.examples.map((example, index) => (
                  <article className="example-panel example-card" key={index}>
                    <div className="example-card-heading">
                      <span className="example-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <span className="eyebrow">
                          {example.kind === "documented"
                            ? "WEB-SOURCED CASE"
                            : "ILLUSTRATIVE · HYPOTHETICAL"}
                        </span>
                        <h2>{example.title}</h2>
                      </div>
                    </div>
                    <div className="example-story">
                      {[
                        ["The problem", example.problem],
                        ["The engineering decision", example.decision],
                        ["The outcome", example.outcome],
                      ].map(([title, text]) => (
                        <div key={title}>
                          <h3>{title}</h3>
                          <p>{text}</p>
                        </div>
                      ))}
                    </div>
                    <div className="example-connection">
                      <h3>Connection to your reading</h3>
                      <p>{example.connection}</p>
                      {example.principle_ids.map((id) => {
                        const chapter = run.snapshot.chapters.find((c) =>
                          c.principles.some((p) => p.id === id),
                        );
                        const principle = chapter?.principles.find(
                          (p) => p.id === id,
                        );
                        return (
                          <button
                            key={id}
                            className="text-button"
                            onClick={() =>
                              chapter &&
                              onSource(run.snapshot.book_id, chapter.id)
                            }
                          >
                            {principle?.title} · p. {principle?.page} ↗
                          </button>
                        );
                      })}
                    </div>
                    <details>
                      <summary>Tradeoffs & when this does not fit</summary>
                      <p>{example.tradeoff}</p>
                    </details>
                    <div className="example-exercise">
                      <h3>Try it in your work</h3>
                      <p>{example.try_it}</p>
                    </div>
                    {example.source_urls.length > 0 && (
                      <div className="example-sources">
                        <h3>Read the evidence</h3>
                        {example.source_urls.map((url) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {run.sources.find((s) => s.url === url)?.title ||
                              new URL(url).hostname}{" "}
                            ↗
                          </a>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
