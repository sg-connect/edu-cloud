import { workCaseInput } from "../../../shared/work-cases";
import { dispatchCases } from "./work-cases";
import { Repository, WorkRepository } from "@edu/database";
import { z, ZodError } from "zod";
import {
  MAX_PDF_BYTES,
  MAX_PDF_MB,
  pdfSizeError,
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
  if (book.upload_status !== "ready")
    throw new HttpError(409, "The PDF has not finished uploading.");
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
    if (resource === "work-cases") {
      const cases = new WorkRepository(env.DB);
      if (!id && method === "GET") return json((await cases.list()).results);
      if (!id && method === "POST") {
        const data = workCaseInput.parse(await bodyJson(request));
        const caseId = crypto.randomUUID();
        await cases.create(caseId, data);
        return json({ id: caseId }, 201);
      }
      const current = await cases.get(id);
      if (!current) throw new HttpError(404, "Practice case not found.");
      if (action === "history" && method === "GET") {
        if (!parts[3]) return json((await cases.history(id)).results);
        const entry = await cases.historyEntry(id, parts[3]);
        if (!entry) throw new HttpError(404, "History entry not found.");
        return json({
          ...entry,
          result: entry.result ? JSON.parse(entry.result) : null,
        });
      }
      if (!action && method === "GET") {
        return json({
          ...current,
          result: current.result ? JSON.parse(current.result) : null,
        });
      }
      if (!action && method === "PUT") {
        const data = workCaseInput
          .extend({ revision: z.number().int().positive() })
          .parse(await bodyJson(request));
        if (!(await cases.update(id, data.revision, data)).meta.changes)
          throw new HttpError(
            409,
            "This case changed in another tab. Reopen it before saving.",
          );
        return json({ ok: true });
      }
      if (!action && method === "DELETE") {
        await cases.delete(id);
        return json({ ok: true });
      }
      if (action === "analyze" && method === "POST") {
        if (!env.OPENAI_API_KEY)
          throw new HttpError(503, "Configure OpenAI before reviewing a case.");
        const { revision } = z
          .object({ revision: z.number().int().positive() })
          .parse(await bodyJson(request));
        if (revision !== current.revision)
          throw new HttpError(
            409,
            "This case changed. Reopen it before analyzing.",
          );
        await cases.queue(id, revision, env.OPENAI_MODEL || "gpt-5.6-luna");
        await dispatchCases(env);
        return json({ ok: true }, 202);
      }
    }
    if (resource === "analyzed" && !id && method === "GET")
      return json((await repo.analyzedChapters()).results);
    if (resource === "status" && method === "GET")
      return json({
        aiConfigured: Boolean(env.OPENAI_API_KEY),
        model: env.OPENAI_MODEL || "gpt-5.6-luna",
        mode: "local",
        maxPdfMB: MAX_PDF_MB,
      });
    if (resource === "books" && !id && method === "GET") {
      const result = await repo.listBooks();
      return json(result.results);
    }
    if (resource === "books" && !id && method === "POST") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(
          new TextDecoder().decode(await boundedBody(request, 6500000)),
        );
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(
          400,
          "Invalid book metadata. Refresh the page and try again.",
        );
      }
      const data = uploadSchema
        .extend({
          filename: z.string().min(1).max(200),
          byte_count: z.number().int().min(5),
        })
        .parse(parsed);
      if (data.byte_count > MAX_PDF_BYTES)
        throw new HttpError(413, pdfSizeError(data.byte_count));
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
        await env.BOOKS.put(pagesKey, JSON.stringify(data.pages), {
          httpMetadata: { contentType: "application/json" },
        });
        await repo.createBook(
          {
            id: bookId,
            title: data.title,
            filename: data.filename,
            byte_count: data.byte_count,
            upload_status: "uploading",
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
    if (resource === "books" && id && action === "pdf" && method === "PUT") {
      const book = await getBook(env, id);
      if (book.upload_status !== "uploading")
        throw new HttpError(409, "This book is already uploaded.");
      if (book.byte_count > MAX_PDF_BYTES)
        throw new HttpError(413, pdfSizeError(book.byte_count));
      if (!request.body)
        throw new HttpError(400, "The PDF file is missing from the upload.");
      const stream = new FixedLengthStream(book.byte_count);
      const writer = stream.writable.getWriter();
      const reader = request.body.getReader();
      const copy = async () => {
        let count = 0;
        let prefix = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            count += value.byteLength;
            if (count > book.byte_count)
              throw new HttpError(
                400,
                "The PDF size changed during upload. Please try again.",
              );
            if (prefix.length < 5) {
              prefix += new TextDecoder().decode(
                value.subarray(0, 5 - prefix.length),
              );
              if (prefix.length === 5 && prefix !== "%PDF-")
                throw new HttpError(400, "The uploaded file is not a PDF.");
            }
            await writer.write(value);
          }
          if (count !== book.byte_count)
            throw new HttpError(
              400,
              "The PDF upload was interrupted. Please try again.",
            );
          await writer.close();
        } catch (error) {
          await Promise.allSettled([writer.abort(error), reader.cancel(error)]);
          throw error;
        }
      };
      // Both operations are awaited; only bounded chunks pass through Worker memory.
      const results = await Promise.allSettled([
        copy(),
        env.BOOKS.put(book.object_key, stream.readable, {
          httpMetadata: { contentType: "application/pdf" },
        }).catch(async (error) => {
          await reader.cancel(error).catch(() => {});
          await writer.abort(error).catch(() => {});
          throw error;
        }),
      ]);
      const failure = results.find((r) => r.status === "rejected");
      if (failure?.status === "rejected") {
        await env.BOOKS.delete(book.object_key);
        throw failure.reason instanceof HttpError
          ? failure.reason
          : new HttpError(
              400,
              "The PDF upload did not finish. Please try again.",
            );
      }
      const completed = await repo.finishUpload(id);
      if (!completed.meta.changes) {
        await env.BOOKS.delete(book.object_key);
        throw new HttpError(
          409,
          "This upload was removed. Please upload again.",
        );
      }
      return json({ ok: true });
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
      await readPages(env, chapter.book_id);
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
          principleIndex: z.number().int().min(0),
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
