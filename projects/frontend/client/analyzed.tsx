"use client";
import { useEffect, useState } from "react";
import { Search, ArrowRight, BookOpen } from "lucide-react";
import type { AnalyzedChapter } from "../../../shared/analyzed";
export default function Analyzed({
  onOpen,
  onLibrary,
}: {
  onOpen: (bookId: string, chapterId: string) => void;
  onLibrary: () => void;
}) {
  const [chapters, setChapters] = useState<AnalyzedChapter[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [book, setBook] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/analyzed", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            "Could not load analyzed chapters. Please reopen this page.",
          );
        setChapters(await r.json());
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  const books = [
    ...new Map(chapters.map((c) => [c.book_id, c.book_title])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const filtered = chapters.filter(
    (c) =>
      (!book || c.book_id === book) &&
      `${c.title} ${c.book_title}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <section className="analyzed-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR READING, BROUGHT TOGETHER</span>
          <h1>Analyzed chapters</h1>
          <p>
            Revisit insights across your books and save the principles you want
            to practice.
          </p>
        </div>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <div className="analyzed-filters">
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Search analyzed chapters"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chapters or books"
          />
        </label>
        <label className="analyzed-book-filter">
          Book
          <select
            aria-label="Filter analyzed chapters by book"
            value={book}
            onChange={(e) => setBook(e.target.value)}
          >
            <option value="">All books</option>
            {books.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <span className="muted" role="status">
          {filtered.length} {filtered.length === 1 ? "chapter" : "chapters"}
        </span>
      </div>
      {loading ? (
        <p className="loading">Loading analyzed chapters…</p>
      ) : chapters.length === 0 ? (
        <div className="empty">
          <BookOpen size={32} />
          <h3>Your insights will gather here.</h3>
          <p>Analyze a chapter in your library to start your collection.</p>
          <button className="button secondary" onClick={onLibrary}>
            Go to library
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <h3>No matching chapters</h3>
          <p>Try another search or choose a different book.</p>
        </div>
      ) : (
        <div className="analyzed-table-wrap">
          <table className="analyzed-table">
            <caption className="sr-only">
              Completed chapter analyses across your books, newest first
            </caption>
            <thead>
              <tr>
                <th scope="col">Chapter</th>
                <th scope="col">Book</th>
                <th scope="col">Principles</th>
                <th scope="col">Analyzed</th>
                <th scope="col">Review</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td data-label="Chapter">
                    <strong>{c.title}</strong>
                    <small>
                      PDF pages {c.start_page}–{c.end_page}
                    </small>
                  </td>
                  <td data-label="Book">{c.book_title}</td>
                  <td data-label="Principles">
                    {c.principle_count} extracted
                    <small>{c.saved_count} saved to tracks</small>
                  </td>
                  <td data-label="Analyzed">
                    {new Date(c.analyzed_at + "Z").toLocaleDateString()}
                  </td>
                  <td>
                    <button
                      className="text-link"
                      aria-label={`Review ${c.title} and save principles`}
                      onClick={() => onOpen(c.book_id, c.id)}
                    >
                      Review &amp; save <ArrowRight size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
