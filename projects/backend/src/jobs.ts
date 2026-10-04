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
    await repo.dispatched(job.id);
  }
}
export async function runJob(env: JobEnvironment, jobId: string) {
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
    if (length > MAX_CHAPTER_CHARS)
      throw new ProviderError(
        "This chapter is too long for the first version. Split its page range into smaller chapters.",
      );
    const result = await analyzeChapter(
      env.OPENAI_API_KEY,
      job.model,
      job.title,
      pages,
    );
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
