import { Repository } from "@edu/database";
import { analyzeChapter, ProviderError } from "./ai";
import { MAX_CHAPTER_CHARS, type PageText } from "@edu/contracts";
export type JobEnvironment = Pick<
  BackendEnv,
  "DB" | "BOOKS" | "JOBS" | "OPENAI_API_KEY" | "OPENAI_MODEL"
>;

export async function dispatchPending(env: JobEnvironment) {
  const repo = new Repository(env.DB);
  const pending = await repo.pendingJobs();
  for (const job of pending.results) {
    await env.JOBS.send({ jobId: job.id });
    await repo.dispatched(job.id, job.attempts);
  }
}
export async function runJob(
  env: JobEnvironment,
  jobId: string,
  analyze = analyzeChapter,
) {
  const token = crypto.randomUUID();
  const repo = new Repository(env.DB);
  const claim = await repo.claim(jobId, token);
  if (!claim.meta.changes) return;
  try {
    const job = await repo.job(jobId);
    if (!job)
      throw new ProviderError(
        "Chapter changed or was removed. Select the updated chapter.",
      );
    const object = await env.BOOKS.get(job.pages_key);
    if (!object)
      throw new ProviderError(
        "Source pages are missing. Upload the book again.",
      );
    const all = await object.json<PageText[]>();
    const pages = all.filter(
      (p) => p.page >= job.start_page && p.page <= job.end_page,
    );
    const length = pages.reduce((n, p) => n + p.text.length, 0);
    if (length < 80)
      throw new ProviderError(
        "Not enough readable text. Scanned PDFs need OCR, which is not supported yet.",
      );
    const sections = splitChapter(pages);
    const saved = await repo.analysisParts(jobId, job.model);
    const results = new Map(
      saved.results.map((p) => [
        p.part_index,
        JSON.parse(p.result) as Awaited<ReturnType<typeof analyzeChapter>>,
      ]),
    );
    const next = sections.findIndex((_, index) => !results.has(index));
    if (next !== -1) {
      const result = await analyze(
        env.OPENAI_API_KEY,
        job.model,
        sections.length === 1
          ? job.title
          : `${job.title} — section ${next + 1} of ${sections.length}`,
        sections[next],
      );
      const stored = await repo.saveAnalysisPart(
        jobId,
        token,
        next,
        job.model,
        result,
      );
      if (!stored.meta.changes) return;
      results.set(next, result);
    }
    if (results.size < sections.length) {
      const continued = await repo.continueJob(jobId, token);
      if (continued.meta.changes) await dispatchPending(env);
      return;
    }
    const ordered = sections.map((_, index) => results.get(index)!);
    const result = {
      model: job.model,
      input_tokens: ordered.reduce((sum, r) => sum + r.input_tokens, 0),
      output_tokens: ordered.reduce((sum, r) => sum + r.output_tokens, 0),
      content: {
        overview: ordered
          .map((r, i) =>
            sections.length === 1
              ? r.content.overview
              : `Section ${i + 1} (PDF pages ${sections[i][0].page}–${sections[i].at(-1)!.page}): ${r.content.overview}`,
          )
          .join("\n\n"),
        principles: ordered.flatMap((r) => r.content.principles),
        questions: ordered.flatMap((r) => r.content.questions),
      },
    };
    await repo.finishJob(jobId, token, result);
  } catch (error) {
    const message =
      error instanceof ProviderError
        ? error.message
        : error instanceof Error && error.name === "TimeoutError"
          ? "Analysis timed out. Retry this chapter."
          : "Analysis failed. Retry this chapter; your source is saved.";
    await repo.failJob(jobId, token, message);
    console.error(
      JSON.stringify({
        event: "analysis_failed",
        jobId,
        kind: error instanceof ProviderError ? "provider" : "internal",
      }),
    );
  }
}

// Page numbers stay absolute; every character is retained in order.
export function splitChapter(pages: PageText[]): PageText[][] {
  const sections: PageText[][] = [];
  let current: PageText[] = [];
  let size = 0;
  for (const page of pages) {
    for (
      let offset = 0;
      offset < page.text.length;
      offset += MAX_CHAPTER_CHARS
    ) {
      const text = page.text.slice(offset, offset + MAX_CHAPTER_CHARS);
      if (size + text.length > MAX_CHAPTER_CHARS && current.length) {
        sections.push(current);
        current = [];
        size = 0;
      }
      current.push({ page: page.page, text });
      size += text.length;
    }
  }
  if (current.length) sections.push(current);
  return sections;
}
