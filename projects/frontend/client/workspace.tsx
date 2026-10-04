"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BriefcaseBusiness,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronRight,
  Cloud,
  FileText,
  Layers3,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
  Pencil,
  ExternalLink,
  MessageCircle,
  Leaf,
} from "lucide-react";
import type {
  Book,
  Chapter,
  ChapterDetail,
  ChapterInput,
  Track,
} from "@edu/contracts";
import WorkCases from "./work-cases";
import { extractPdf } from "./pdf";

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "content-type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
const send = (method: string, data?: unknown): RequestInit => ({
  method,
  ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
});
function Spinner() {
  return <LoaderCircle size={17} className="spin" />;
}
function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

export default function Workspace() {
  const [view, setView] = useState<"library" | "tracks" | "notebook" | "cases">(
    "library",
  );
  const [books, setBooks] = useState<Book[]>([]),
    [tracks, setTracks] = useState<Track[]>([]),
    [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{
    aiConfigured: boolean;
    model: string;
  } | null>(null);
  const [bookId, setBookId] = useState<string | null>(null),
    [chapterId, setChapterId] = useState<string | null>(null);
  const [book, setBook] = useState<{ book: Book; chapters: Chapter[] } | null>(
    null,
  );
  const [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [progress, setProgress] = useState(""),
    [search, setSearch] = useState("");
  const [outline, setOutline] = useState<ChapterInput[] | null>(null),
    [outlineBusy, setOutlineBusy] = useState(false);
  const [newTrack, setNewTrack] = useState(false),
    [trackTitle, setTrackTitle] = useState(""),
    [trackBusy, setTrackBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  async function refresh() {
    const [b, t, s] = await Promise.all([
      api<Book[]>("books"),
      api<Track[]>("tracks"),
      api<{ aiConfigured: boolean; model: string }>("status"),
    ]);
    setBooks(b);
    setTracks(t);
    setStatus(s);
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!bookId) {
      setBook(null);
      return;
    }
    const controller = new AbortController();
    api<{ book: Book; chapters: Chapter[] }>(`books/${bookId}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setBook(data);
        setChapterId((current) =>
          data.chapters.some((c) => c.id === current)
            ? current
            : data.chapters[0]?.id || null,
        );
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [bookId]);
  async function reloadBook() {
    if (bookId) setBook(await api(`books/${bookId}`));
    await refresh();
  }
  function navigate(next: typeof view) {
    setView(next);
    setBookId(null);
    setChapterId(null);
    setError("");
  }
  async function upload(file: File) {
    setError("");
    setProgress("Opening PDF…");
    try {
      const metadata = await extractPdf(file, setProgress);
      setProgress("Saving your book…");
      const result = await api<{ id: string }>(
        "books",
        send("POST", {
          ...metadata,
          filename: file.name.slice(0, 200),
          byte_count: file.size,
        }),
      );
      try {
        const uploaded = await fetch(`/api/books/${result.id}/pdf`, {
          method: "PUT",
          headers: { "content-type": "application/pdf" },
          body: file,
        });
        if (!uploaded.ok) {
          const failure = (await uploaded.json()) as { error?: string };
          throw new Error(
            failure.error || "PDF upload failed. Please try again.",
          );
        }
      } catch (error) {
        await api(`books/${result.id}`, send("DELETE")).catch(() => {});
        throw error;
      }
      await refresh();
      setBookId(result.id);
      setView("library");
      setToast("Book added. Review the chapter outline before analyzing.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setProgress("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function sample() {
    try {
      setProgress("Opening the sample…");
      const r = await fetch("/sample.pdf");
      if (!r.ok) throw new Error("Sample unavailable. Run npm run sample.");
      await upload(
        new File([await r.blob()], "Engineering field notes.pdf", {
          type: "application/pdf",
        }),
      );
    } catch (e) {
      setProgress("");
      setError((e as Error).message);
    }
  }
  async function saveOutline() {
    if (!outline || !bookId) return;
    setOutlineBusy(true);
    try {
      await api(`books/${bookId}/chapters`, send("PUT", outline));
      setOutline(null);
      const next = await api<{ book: Book; chapters: Chapter[] }>(
        `books/${bookId}`,
      );
      setBook(next);
      setChapterId(next.chapters[0]?.id || null);
      await refresh();
      setToast("Chapter outline saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOutlineBusy(false);
    }
  }
  async function createTrack() {
    setTrackBusy(true);
    try {
      await api("tracks", send("POST", { title: trackTitle }));
      await refresh();
      setNewTrack(false);
      setTrackTitle("");
      setToast("Track created. Save chapter principles into it.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTrackBusy(false);
    }
  }
  const allItems = tracks.flatMap((t) =>
    t.items.map((i) => ({ ...i, trackTitle: t.title })),
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          edu<span>cloud</span>
          <span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR LEARNING SPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={view === "library" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("library")}
          >
            <BookOpen size={19} />
            My library<span className="nav-count">{books.length}</span>
          </button>
          <button
            className={view === "tracks" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("tracks")}
          >
            <Layers3 size={19} />
            Learning tracks
          </button>
          <button
            className={view === "notebook" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("notebook")}
          >
            <Bookmark size={19} />
            My principles<span className="nav-count">{allItems.length}</span>
          </button>
          <button
            className={view === "cases" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("cases")}
          >
            <BriefcaseBusiness size={19} />
            Work cases
          </button>
        </nav>
        <div className="sidebar-note">
          <Leaf size={22} />
          <h4>Depth over speed.</h4>
          <p>Great engineering starts with understanding why.</p>
        </div>
        <div className="local-profile">
          <span className="avatar">SE</span>
          <div>
            <strong>Personal workspace</strong>
            <small>
              <span className="status-dot" />
              Running locally
            </small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <span>
              {book
                ? book.book.title
                : view === "library"
                  ? "My library"
                  : view === "tracks"
                    ? "Learning tracks"
                    : view === "cases"
                      ? "Work cases"
                      : "My principles"}
            </span>
          </div>
          <span className="local-chip">
            <Cloud size={15} />
            Local workspace
          </span>
        </header>
        <main>
          {error && (
            <div className="alert" role="alert">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
          {progress && (
            <div className="progress-banner" role="status">
              <Spinner />
              {progress}
              <span>Keep this tab open while importing.</span>
            </div>
          )}
          {!status?.aiConfigured && status && (
            <div className="alert subtle">
              OpenAI is not configured. Add your key to the ignored .env file
              and restart. You can still upload and read books.
            </div>
          )}
          {bookId && book ? (
            <>
              <button
                className="back-link"
                onClick={() => {
                  setBookId(null);
                  setChapterId(null);
                }}
              >
                <ArrowLeft size={16} />
                Back to library
              </button>
              <div className="page-heading compact">
                <div>
                  <span className="eyebrow">CHAPTER WORKSPACE</span>
                  <h1>{book.book.title}</h1>
                  <p>
                    {book.book.page_count} pages · {book.chapters.length}{" "}
                    chapters · Your private copy
                  </p>
                </div>
                <a
                  className="button secondary"
                  href={`/api/books/${bookId}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} />
                  Original PDF
                </a>
              </div>
              <div className="reader-layout">
                <aside className="outline-panel">
                  <div className="section-heading">
                    <h3>Contents</h3>
                    <button
                      className="icon-button"
                      aria-label="Edit chapter outline"
                      onClick={() =>
                        setOutline(
                          book.chapters.map((c) => ({
                            title: c.title,
                            start_page: c.start_page,
                            end_page: c.end_page,
                          })),
                        )
                      }
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                  <p className="muted small">
                    Check detected chapters before your first analysis.
                  </p>
                  <div className="chapter-list">
                    {book.chapters.map((c, i) => (
                      <button
                        key={c.id}
                        onClick={() => setChapterId(c.id)}
                        className={`chapter-link ${chapterId === c.id ? "selected" : ""}`}
                      >
                        <span className="chapter-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span>
                          <strong>{c.title}</strong>
                          <small>
                            Pages {c.start_page}–{c.end_page}
                          </small>
                        </span>
                        {c.status === "ready" && <CheckCircle2 size={14} />}
                      </button>
                    ))}
                  </div>
                </aside>
                {chapterId && (
                  <ChapterWorkspace
                    key={chapterId}
                    id={chapterId}
                    bookId={bookId}
                    tracks={tracks}
                    configured={!!status?.aiConfigured}
                    onSaved={async (message) => {
                      setToast(message);
                      await reloadBook();
                    }}
                  />
                )}
              </div>
            </>
          ) : bookId ? (
            <div className="loading">
              <Spinner />
              Opening book…
            </div>
          ) : view === "cases" ? (
            <WorkCases
              configured={Boolean(status?.aiConfigured)}
              onSource={(bookId, chapterId) => {
                setView("library");
                setBookId(bookId);
                setChapterId(chapterId);
              }}
            />
          ) : view === "library" ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">THE ENGINEER’S BOOKSHELF</span>
                  <h1>
                    A little reading.
                    <br />
                    <span>A deeper understanding.</span>
                  </h1>
                  <p>
                    Turn the books you read into principles you can build with.
                  </p>
                </div>
                <button
                  className="button primary"
                  disabled={loading || !!progress}
                  onClick={() => fileInput.current?.click()}
                >
                  <Plus size={18} />
                  Add a book
                </button>
              </div>
              <section className="hero">
                <div className="hero-content">
                  <span className="pill">
                    <Sparkles size={13} />
                    BUILT FOR CURIOUS ENGINEERS
                  </span>
                  <h2>
                    Don’t just collect books.
                    <br />
                    Connect the ideas.
                  </h2>
                  <p>
                    Explore a chapter. Question its assumptions. Bring a
                    principle into your next engineering decision.
                  </p>
                  <button
                    className="hero-link"
                    onClick={() =>
                      books.length ? setBookId(books[0].id) : sample()
                    }
                    disabled={loading || !!progress}
                  >
                    {books.length
                      ? "Continue exploring"
                      : "Explore a sample chapter"}
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="art-book back">
                    <span>SYSTEMS</span>
                    <span>01</span>
                  </div>
                  <div className="art-book front">
                    <span>
                      THE ART OF
                      <br />
                      THINKING
                      <br />
                      CLEARLY
                    </span>
                    <div className="book-line" />
                    <Layers3 size={45} />
                    <small>READ. REFLECT. BUILD.</small>
                  </div>
                  <div className="sparkle s1">✳</div>
                  <div className="sparkle s2">+</div>
                </div>
              </section>
              <div className="library-toolbar">
                <div className="section-heading">
                  <h2>Your library</h2>
                  <span className="count-pill">{books.length}</span>
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search books"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find a book…"
                  />
                </label>
              </div>
              {loading ? (
                <div className="loading">
                  <Spinner />
                  Loading library…
                </div>
              ) : books.length === 0 ? (
                <div
                  className="upload-zone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!progress && e.dataTransfer.files[0])
                      upload(e.dataTransfer.files[0]);
                  }}
                >
                  <span className="upload-icon">
                    <Upload size={24} />
                  </span>
                  <h3>Your next idea starts with a book</h3>
                  <p>Drop a PDF here, or choose one from your computer.</p>
                  <button
                    className="button secondary"
                    disabled={loading || !!progress}
                    onClick={() => fileInput.current?.click()}
                  >
                    Choose a PDF
                    <ArrowRight size={15} />
                  </button>
                  <small>
                    Text-based PDFs · Up to 100 MB · Stored privately on this
                    computer
                  </small>
                </div>
              ) : (
                <div className="book-grid">
                  {books
                    .filter((b) =>
                      b.title.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((b, i) => (
                      <article className="book-card" key={b.id}>
                        <button
                          className={`book-cover color-${i % 4}`}
                          onClick={() => setBookId(b.id)}
                        >
                          <span className="cover-top">
                            YOUR ENGINEERING LIBRARY
                          </span>
                          <strong>{b.title}</strong>
                          <div className="cover-symbol">
                            <Layers3 size={45} strokeWidth={1} />
                          </div>
                          <span className="cover-bottom">
                            READ · UNDERSTAND · APPLY
                          </span>
                        </button>
                        <div className="book-meta">
                          <span className="book-type">
                            PDF · {b.page_count} PAGES
                          </span>
                          <button
                            className="book-title"
                            onClick={() => setBookId(b.id)}
                          >
                            {b.title}
                          </button>
                          <div className="book-progress">
                            <div
                              style={{
                                width: `${b.chapter_count ? (100 * b.analyzed_count) / b.chapter_count : 0}%`,
                              }}
                            />
                          </div>
                          <div className="book-card-footer">
                            <span>
                              {b.analyzed_count} of {b.chapter_count} chapters
                              explored
                            </span>
                            <button
                              className="icon-button"
                              aria-label={`Delete ${b.title}`}
                              onClick={async () => {
                                if (
                                  confirm(
                                    "Delete this book, its analyses, notes, and saved principles?",
                                  )
                                )
                                  try {
                                    await api(`books/${b.id}`, send("DELETE"));
                                    await refresh();
                                  } catch (e) {
                                    setError((e as Error).message);
                                  }
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  <button
                    className="add-card"
                    disabled={loading || !!progress}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Plus size={26} />
                    <strong>Make room for a new idea</strong>
                    <span>Add another book</span>
                  </button>
                </div>
              )}
              <section className="how-it-works">
                <div>
                  <span>01</span>
                  <strong>Bring your books</strong>
                  <p>A library built around your curiosity.</p>
                </div>
                <div>
                  <span>02</span>
                  <strong>Unpack the principles</strong>
                  <p>Ground every insight in its source.</p>
                </div>
                <div>
                  <span>03</span>
                  <strong>Make it your own</strong>
                  <p>Collect ideas into learning tracks.</p>
                </div>
              </section>
            </>
          ) : view === "tracks" ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">FOLLOW YOUR CURIOSITY</span>
                  <h1>Your learning tracks.</h1>
                  <p>
                    Connect principles across books, one engineering question at
                    a time.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setNewTrack(true)}
                >
                  <Plus size={18} />
                  New track
                </button>
              </div>
              <div className="track-grid">
                {tracks.map((t, i) => (
                  <section className="track-card" key={t.id}>
                    <div className={`track-icon color-${i % 4}`}>
                      <Layers3 size={25} />
                    </div>
                    <span className="eyebrow">
                      {t.items.length} SAVED PRINCIPLES
                    </span>
                    <h2>{t.title}</h2>
                    <p>
                      {t.description ||
                        "Your own path through the ideas that matter."}
                    </p>
                    {t.items.length > 0 ? (
                      <>
                        <div className="book-progress">
                          <div
                            style={{
                              width: `${(100 * t.items.filter((i) => i.completed).length) / t.items.length}%`,
                            }}
                          />
                        </div>
                        <span className="small muted">
                          {t.items.filter((i) => i.completed).length} applied ·{" "}
                          {t.items.length} collected
                        </span>
                        <div className="track-items">
                          {t.items.map((item) => (
                            <div className="track-item" key={item.id}>
                              <input
                                type="checkbox"
                                aria-label={`Applied ${item.title}`}
                                checked={!!item.completed}
                                onChange={async (e) => {
                                  try {
                                    await api(
                                      `items/${item.id}`,
                                      send("PATCH", {
                                        completed: e.target.checked,
                                      }),
                                    );
                                    await refresh();
                                  } catch (e) {
                                    setError((e as Error).message);
                                  }
                                }}
                              />
                              <button
                                onClick={() => {
                                  setView("library");
                                  setChapterId(item.chapter_id);
                                  setBookId(item.book_id);
                                }}
                              >
                                <strong>{item.title}</strong>
                                <small>
                                  {item.book_title} · p. {item.page}
                                </small>
                              </button>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="track-empty">
                        Save a principle from a chapter to begin this track.
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">IDEAS WORTH KEEPING</span>
                  <h1>Your principle notebook.</h1>
                  <p>The ideas you’ve chosen to carry into your work.</p>
                </div>
              </div>
              {allItems.length === 0 ? (
                <Empty
                  icon={<Bookmark size={27} />}
                  title="A place for your next insight"
                >
                  <p>
                    Analyze a chapter and save a principle to a track.
                    <br />
                    Your collection will grow here.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => navigate("library")}
                  >
                    Explore your library
                    <ArrowRight size={16} />
                  </button>
                </Empty>
              ) : (
                <div className="principle-grid">
                  {allItems.map((item) => (
                    <article className="saved-card" key={item.id}>
                      <span className="tag">{item.trackTitle}</span>
                      <h3>{item.title}</h3>
                      <p>{item.explanation}</p>
                      <div className="saved-footer">
                        <button
                          className="text-link"
                          onClick={() => {
                            setView("library");
                            setChapterId(item.chapter_id);
                            setBookId(item.book_id);
                          }}
                        >
                          {item.book_title} · p. {item.page}
                          <ArrowRight size={14} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Remove ${item.title}`}
                          onClick={async () => {
                            try {
                              await api(`items/${item.id}`, send("DELETE"));
                              await refresh();
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          <footer className="footer">
            <span>Made for the craft of software engineering.</span>
            <span>Read deeply. Build thoughtfully.</span>
          </footer>
        </main>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) upload(e.target.files[0]);
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {outline && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="outline-title"
          >
            <div className="section-heading">
              <h2 id="outline-title">Review the chapter outline</h2>
              <button
                className="icon-button"
                aria-label="Close outline"
                onClick={() => setOutline(null)}
              >
                <X />
              </button>
            </div>
            <p className="muted">
              Use PDF page numbers, including opening pages. Adjust before
              analyzing; saved analyses lock the outline.
            </p>
            <div className="outline-editor">
              {outline.map((c, i) => (
                <div className="outline-row" key={i}>
                  <input
                    aria-label={`Chapter ${i + 1} title`}
                    value={c.title}
                    onChange={(e) =>
                      setOutline(
                        outline.map((x, n) =>
                          n === i ? { ...x, title: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={`Chapter ${i + 1} start page`}
                    type="number"
                    min="1"
                    value={c.start_page}
                    onChange={(e) =>
                      setOutline(
                        outline.map((x, n) =>
                          n === i
                            ? { ...x, start_page: Number(e.target.value) }
                            : x,
                        ),
                      )
                    }
                  />
                  <span>to</span>
                  <input
                    aria-label={`Chapter ${i + 1} end page`}
                    type="number"
                    min="1"
                    value={c.end_page}
                    onChange={(e) =>
                      setOutline(
                        outline.map((x, n) =>
                          n === i
                            ? { ...x, end_page: Number(e.target.value) }
                            : x,
                        ),
                      )
                    }
                  />
                  <button
                    className="icon-button"
                    aria-label={`Remove chapter ${i + 1}`}
                    onClick={() =>
                      setOutline(outline.filter((_, n) => n !== i))
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() =>
                  setOutline([
                    ...outline,
                    {
                      title: "New chapter",
                      start_page: (outline.at(-1)?.end_page || 0) + 1,
                      end_page: book?.book.page_count || 1,
                    },
                  ])
                }
              >
                <Plus size={16} />
                Add chapter
              </button>
              <button
                className="button primary"
                disabled={outlineBusy || outline.length === 0}
                onClick={saveOutline}
              >
                {outlineBusy ? <Spinner /> : <Check size={16} />}Save outline
              </button>
            </div>
          </section>
        </div>
      )}
      {newTrack && (
        <div className="modal-backdrop">
          <form
            className="modal small-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="track-title"
            onSubmit={(e) => {
              e.preventDefault();
              createTrack();
            }}
          >
            <div className="section-heading">
              <h2 id="track-title">Create a learning track</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close track dialog"
                onClick={() => setNewTrack(false)}
              >
                <X />
              </button>
            </div>
            <label className="field-label">
              What would you like to explore?
              <input
                autoFocus
                required
                maxLength={120}
                placeholder="e.g. Designing for change"
                value={trackTitle}
                onChange={(e) => setTrackTitle(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={trackBusy}>
              {trackBusy ? <Spinner /> : <Plus size={16} />}Create track
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function ChapterWorkspace({
  id,
  bookId,
  tracks,
  configured,
  onSaved,
}: {
  id: string;
  bookId: string;
  tracks: Track[];
  configured: boolean;
  onSaved: (message: string) => Promise<void>;
}) {
  const [detail, setDetail] = useState<ChapterDetail | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState<"analysis" | "source" | "notes">("analysis"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [trackId, setTrackId] = useState(tracks[0]?.id || "");
  const [saveIndex, setSaveIndex] = useState<number | null>(null);
  useEffect(() => {
    const c = new AbortController();
    api<ChapterDetail>(`chapters/${id}`, { signal: c.signal })
      .then((d) => {
        setDetail(d);
        setNote(d.note);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [id]);
  const running =
    detail?.chapter.status === "queued" || detail?.chapter.status === "running";
  useEffect(() => {
    if (!running) return;
    let alive = true;
    const c = new AbortController();
    const timer = setInterval(() => {
      api<ChapterDetail>(`chapters/${id}`, { signal: c.signal })
        .then((d) => {
          if (alive) {
            setDetail(d);
            if (d.chapter.status === "ready")
              onSaved("Chapter analysis is ready.").catch(() => {});
          }
        })
        .catch((e) => {
          if (alive && e.name !== "AbortError") setError(e.message);
        });
    }, 2000);
    return () => {
      alive = false;
      c.abort();
      clearInterval(timer);
    };
  }, [id, running]);
  async function analyze() {
    setBusy(true);
    setError("");
    try {
      await api(`chapters/${id}/analyze`, send("POST"));
      setDetail(await api(`chapters/${id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!detail)
    return (
      <div className="reader-content">
        <div className="loading">
          <Spinner />
          {error || "Opening chapter…"}
        </div>
      </div>
    );
  const analysis = detail.analysis?.content;
  return (
    <section className="reader-content">
      <div className="reader-heading">
        <span className="eyebrow">
          PAGES {detail.chapter.start_page}–{detail.chapter.end_page}
        </span>
        <h2>{detail.chapter.title}</h2>
        <p>
          Understand the argument. Explore where it holds—and where it doesn’t.
        </p>
      </div>
      <div className="reader-tabs" role="tablist">
        {(
          [
            ["analysis", "Principles", Sparkles],
            ["source", "Source text", FileText],
            ["notes", "My notes", Pencil],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {tab === "analysis" ? (
        <>
          {!analysis ? (
            <Empty
              icon={running ? <Spinner /> : <Sparkles size={27} />}
              title={
                running ? "Unpacking this chapter…" : "Go beyond the summary"
              }
            >
              <p>
                {running
                  ? "Your analysis continues in the background. You can leave this chapter and return."
                  : "Explore the key principles, their assumptions, and how they apply to your engineering work."}
              </p>
              {detail.chapter.error && (
                <p className="error-text" role="alert">
                  {detail.chapter.error}
                </p>
              )}
              <button
                className="button primary"
                disabled={busy || running || !configured}
                onClick={analyze}
              >
                {busy || running ? <Spinner /> : <Sparkles size={16} />}{" "}
                {running
                  ? "Analyzing chapter"
                  : detail.chapter.status === "failed"
                    ? "Retry analysis"
                    : "Analyze this chapter"}
              </button>
              <small className="provider-note">
                Sends this chapter’s extracted text to OpenAI. API usage is
                billed to your key. Large chapters are analyzed in sections
                using multiple calls; completed sections are saved for retries.
              </small>
              {running && (
                <button className="text-link" onClick={analyze}>
                  Recover interrupted job
                </button>
              )}
            </Empty>
          ) : (
            <>
              <div className="analysis-intro">
                <span className="eyebrow">THE CHAPTER AT A GLANCE</span>
                <p style={{ whiteSpace: "pre-line" }}>{analysis.overview}</p>
              </div>
              <div className="section-heading principle-heading">
                <h3>Principles to take with you</h3>
                <span className="count-pill">{analysis.principles.length}</span>
              </div>
              <div className="save-destination">
                <Bookmark size={15} />
                <label htmlFor="track-destination">Save principles to</label>
                <select
                  id="track-destination"
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                >
                  {tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
              {analysis.principles.map((p, i) => (
                <article className="principle-card" key={i}>
                  <div className="principle-title">
                    <span className="principle-index">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3>{p.title}</h3>
                    <button
                      className="icon-button"
                      disabled={saveIndex !== null || !trackId}
                      aria-label={`Save ${p.title}`}
                      onClick={async () => {
                        setSaveIndex(i);
                        try {
                          await api(
                            `tracks/${trackId}/items`,
                            send("POST", { chapterId: id, principleIndex: i }),
                          );
                          await onSaved("Principle saved to your track.");
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setSaveIndex(null);
                        }
                      }}
                    >
                      {saveIndex === i ? <Spinner /> : <Bookmark size={18} />}
                    </button>
                  </div>
                  <p>{p.explanation}</p>
                  <blockquote>
                    {p.evidence}
                    <a
                      href={`/api/books/${bookId}/pdf#page=${p.page}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      PDF page {p.page}
                      <ExternalLink size={12} />
                    </a>
                  </blockquote>
                  <details>
                    <summary>
                      Application & tradeoffs<span>AI interpretation</span>
                    </summary>
                    <h4>Bring it into practice</h4>
                    <p>{p.application}</p>
                    <h4>Where to be careful</h4>
                    <p>{p.tradeoff}</p>
                  </details>
                </article>
              ))}
              <div className="reflection">
                <MessageCircle size={21} />
                <div>
                  <h3>Pause and think</h3>
                  {analysis.questions.map((q, i) => (
                    <p key={i}>{q}</p>
                  ))}
                  <button className="text-link" onClick={() => setTab("notes")}>
                    Write your reflection
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
              <div className="analysis-meta">
                {detail.analysis?.model} ·{" "}
                {(
                  (detail.analysis?.input_tokens || 0) +
                  (detail.analysis?.output_tokens || 0)
                ).toLocaleString()}{" "}
                tokens · Evidence excerpts matched to source text.
                Interpretations still need your judgment.
              </div>
            </>
          )}
        </>
      ) : tab === "source" ? (
        <div className="source-pages">
          <p className="muted small">
            Extracted text may lose tables or diagrams. Check the original PDF
            when layout matters.
          </p>
          {detail.pages.map((p) => (
            <article key={p.page} id={`page-${p.page}`}>
              <span className="eyebrow">PDF PAGE {p.page}</span>
              <p>{p.text || "No text extracted on this page."}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="notes-panel">
          <h3>Make this chapter your own.</h3>
          <p className="muted">
            What changed your mind? Where would you apply this? What do you
            disagree with?
          </p>
          <textarea
            aria-label="Chapter notes"
            placeholder="Your thoughts, questions, and engineering decisions…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={20000}
          />
          <div className="notes-footer">
            <span className="small muted">
              Private notes · {note.length.toLocaleString()} / 20,000
            </span>
            <button
              className="button primary"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await api(
                    `chapters/${id}/note`,
                    send("PUT", { content: note }),
                  );
                  await onSaved("Notes saved.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? <Spinner /> : <Check size={16} />}Save notes
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
