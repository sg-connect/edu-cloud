import { Repository } from "@edu/database";
import { z, ZodError } from "zod";
import {
  MAX_PDF_BYTES,
  MAX_CHAPTER_CHARS,
  uploadSchema,
  chapterInput,
  validateChapters,
  type PageText,
  type Analysis,
} from "@edu/contracts";
import { dispatchPending } from "./jobs";
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
export function guardLocal(request: Request, mode: string) {
  const url = new URL(request.url);
  if (
    mode !== "local" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new HttpError(
      403,
      "This prototype is restricted to localhost. Configure authentication before hosting it.",
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin)
    throw new HttpError(403, "Cross-origin requests are not allowed.");
  if (!["GET", "HEAD"].includes(request.method) && origin !== url.origin)
    throw new HttpError(403, "A same-origin request is required.");
}
async function boundedBody(request: Request, max: number) {
  if (Number(request.headers.get("content-length") || 0) > max)
    throw new HttpError(413, "Upload exceeds the size limit.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new HttpError(413, "Upload exceeds the size limit.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
async function bodyJson(request: Request) {
  try {
    return JSON.parse(
      new TextDecoder().decode(await boundedBody(request, 100000)),
    );
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Invalid JSON request.");
  }
}
async function getBook(env: BackendEnv, id: string) {
  const book = await new Repository(env.DB).book(id);
  if (!book) throw new HttpError(404, "Book not found.");
  return book;
}
async function getChapter(env: BackendEnv, id: string) {
  const chapter = await new Repository(env.DB).chapter(id);
  if (!chapter) throw new HttpError(404, "Chapter not found.");
  return chapter;
}
async function readPages(env: BackendEnv, bookId: string) {
  const book = await getBook(env, bookId);
  const object = await env.BOOKS.get(book.pages_key);
  if (!object) throw new HttpError(404, "Extracted pages are missing.");
  return object.json<PageText[]>();
}
export async function handleApi(
  request: Request,
  env: BackendEnv,
): Promise<Response> {
  try {
    guardLocal(request, env.APP_MODE);
    const repo = new Repository(env.DB);
    const parts = new URL(request.url).pathname
      .split("/")
      .filter(Boolean)
      .slice(1);
    const [resource, id, action] = parts;
    const method = request.method;
    if (resource === "status" && method === "GET")
      return json({
        aiConfigured: Boolean(env.OPENAI_API_KEY),
        model: env.OPENAI_MODEL || "gpt-5.6-luna",
        mode: "local",
        maxPdfMB: 20,
      });
    if (resource === "books" && !id && method === "GET") {
      const result = await repo.listBooks();
      return json(result.results);
    }
    if (resource === "books" && !id && method === "POST") {
      const raw = await boundedBody(request, MAX_PDF_BYTES + 6500000);
      const form = await new Response(raw, {
        headers: { "content-type": request.headers.get("content-type") || "" },
      }).formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size > MAX_PDF_BYTES || file.size < 5)
        throw new HttpError(400, "Choose a PDF up to 20 MB.");
      const prefix = new TextDecoder().decode(
        await file.slice(0, 5).arrayBuffer(),
      );
      if (prefix !== "%PDF-")
        throw new HttpError(400, "The uploaded file is not a PDF.");
      const metadata = form.get("metadata");
      if (typeof metadata !== "string" || metadata.length > 6000000)
        throw new HttpError(400, "Invalid PDF metadata.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(metadata);
      } catch {
        throw new HttpError(400, "Invalid PDF metadata.");
      }
      const data = uploadSchema.parse(parsed);
      if (data.pages.some((p, i) => p.page !== i + 1))
        throw new HttpError(400, "PDF pages must be sequential.");
      if (data.pages.reduce((n, p) => n + p.text.length, 0) > 3000000)
        throw new HttpError(
          400,
          "The extracted book is too large for this version.",
        );
      if (data.pages.reduce((n, p) => n + p.text.trim().length, 0) < 80)
        throw new HttpError(
          400,
          "No readable text found. Scanned PDFs need OCR, which is not supported yet.",
        );
      validateChapters(data.chapters, data.pages.length);
      const bookId = crypto.randomUUID(),
        objectKey = `books/${bookId}/source.pdf`,
        pagesKey = `books/${bookId}/pages.json`;
      try {
        await env.BOOKS.put(objectKey, file.stream(), {
          httpMetadata: { contentType: "application/pdf" },
        });
        await env.BOOKS.put(pagesKey, JSON.stringify(data.pages), {
          httpMetadata: { contentType: "application/json" },
        });
        await repo.createBook(
          {
            id: bookId,
            title: data.title,
            filename: file.name.slice(0, 200),
            page_count: data.pages.length,
            object_key: objectKey,
            pages_key: pagesKey,
          },
          data.chapters,
        );
      } catch (e) {
        await env.BOOKS.delete([objectKey, pagesKey]);
        throw e;
      }
      return json({ id: bookId }, 201);
    }
    if (resource === "books" && id && action === "pdf" && method === "GET") {
      const book = await getBook(env, id);
      const object = await env.BOOKS.get(book.object_key);
      if (!object) throw new HttpError(404, "PDF not found.");
      return new Response(object.body, {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'inline; filename="book.pdf"',
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (resource === "books" && id && !action && method === "GET") {
      const book = await getBook(env, id);
      const chapters = await repo.chapters(id);
      return json({ book, chapters: chapters.results });
    }
    if (
      resource === "books" &&
      id &&
      action === "chapters" &&
      method === "PUT"
    ) {
      const book = await getBook(env, id);
      const chapters = z
        .array(chapterInput)
        .min(1)
        .max(100)
        .parse(await bodyJson(request));
      validateChapters(chapters, book.page_count);
      if (await repo.outlineLocked(id))
        throw new HttpError(
          409,
          "The outline is locked once analysis or notes are saved. Upload a separate copy to use a different outline.",
        );
      await repo.replaceChapters(id, chapters);
      return json({ ok: true });
    }
    if (resource === "books" && id && method === "DELETE") {
      const book = await getBook(env, id);
      // Removing objects first leaves a retryable book record if deletion fails.
      await env.BOOKS.delete([book.object_key, book.pages_key]);
      await repo.deleteBook(id);
      return json({ ok: true });
    }
    if (resource === "chapters" && id && !action && method === "GET") {
      const chapter = await getChapter(env, id);
      const pages = (await readPages(env, chapter.book_id)).filter(
        (p) => p.page >= chapter.start_page && p.page <= chapter.end_page,
      );
      const analysis = await repo.analysis(id, chapter.version);
      const note = await repo.note(id);
      return json({
        chapter,
        pages,
        analysis: analysis
          ? { ...analysis, content: JSON.parse(analysis.content) }
          : null,
        note: note?.content || "",
      });
    }
    if (
      resource === "chapters" &&
      id &&
      action === "analyze" &&
      method === "POST"
    ) {
      if (!env.OPENAI_API_KEY)
        throw new HttpError(
          503,
          "Add OPENAI_API_KEY to .env and restart the local app.",
        );
      const chapter = await getChapter(env, id);
      const pages = (await readPages(env, chapter.book_id)).filter(
        (p) => p.page >= chapter.start_page && p.page <= chapter.end_page,
      );
      if (pages.reduce((n, p) => n + p.text.length, 0) > MAX_CHAPTER_CHARS)
        throw new HttpError(
          400,
          "This chapter is too long. Split the outline into smaller page ranges before analyzing.",
        );
      const jobId = `${id}:${chapter.version}`;
      await repo.queueJob(
        jobId,
        id,
        chapter.version,
        env.OPENAI_MODEL || "gpt-5.6-luna",
      );
      await dispatchPending(env);
      return json({ jobId }, 202);
    }
    if (
      resource === "chapters" &&
      id &&
      action === "note" &&
      method === "PUT"
    ) {
      await getChapter(env, id);
      const { content } = z
        .object({ content: z.string().max(20000) })
        .parse(await bodyJson(request));
      await repo.saveNote(id, content);
      return json({ ok: true });
    }
    if (resource === "tracks" && !id && method === "GET") {
      const tracks = await repo.tracks();
      const items = await repo.trackItems();
      return json(
        tracks.results.map((t) => ({
          ...t,
          items: items.results.filter((i) => i.track_id === t.id),
        })),
      );
    }
    if (resource === "tracks" && id && !action && method === "DELETE") {
      await repo.deleteTrack(id);
      return json({ ok: true });
    }
    if (resource === "tracks" && !id && method === "POST") {
      const input = z
        .object({
          title: z.string().trim().min(1).max(120),
          description: z.string().max(500).default(""),
        })
        .parse(await bodyJson(request));
      const trackId = crypto.randomUUID();
      await repo.createTrack(trackId, input.title, input.description);
      return json({ id: trackId }, 201);
    }
    if (
      resource === "tracks" &&
      id &&
      action === "items" &&
      method === "POST"
    ) {
      const input = z
        .object({
          chapterId: z.string(),
          principleIndex: z.number().int().min(0).max(7),
        })
        .parse(await bodyJson(request));
      const track = await repo.track(id);
      if (!track) throw new HttpError(404, "Track not found.");
      const chapter = await getChapter(env, input.chapterId);
      const analysis = await repo.analysis(chapter.id, chapter.version);
      if (!analysis) throw new HttpError(400, "Analyze this chapter first.");
      const principle = (JSON.parse(analysis.content) as Analysis).principles[
        input.principleIndex
      ];
      if (!principle) throw new HttpError(400, "Principle not found.");
      await repo.savePrinciple(id, chapter.id, principle);
      return json({ ok: true });
    }
    if (resource === "items" && id && method === "PATCH") {
      const { completed } = z
        .object({ completed: z.boolean() })
        .parse(await bodyJson(request));
      const result = await repo.completeItem(id, completed);
      if (!result.meta.changes)
        throw new HttpError(404, "Saved principle not found.");
      return json({ ok: true });
    }
    if (resource === "items" && id && method === "DELETE") {
      await repo.deleteItem(id);
      return json({ ok: true });
    }
    throw new HttpError(404, "Endpoint not found.");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof ZodError)
      return json(
        {
          error:
            "Some fields are invalid. Check titles, page ranges, and text length.",
        },
        400,
      );
    if (e instanceof Error && e.message.startsWith("Chapter ranges"))
      return json({ error: e.message }, 400);
    console.error(
      JSON.stringify({
        event: "api_error",
        path: new URL(request.url).pathname,
      }),
    );
    return json(
      {
        error:
          "Something went wrong. Your existing library is safe. Please try again.",
      },
      500,
    );
  }
}
