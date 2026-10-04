import { runCase, dispatchCases } from "./work-cases";
import { handleApi } from "./api";
import { Repository, WorkRepository } from "@edu/database";
import { dispatchPending, runJob, type JobEnvironment } from "./jobs";
export default {
  fetch(request: Request, env: BackendEnv) {
    return handleApi(request, env);
  },
  async queue(
    batch: MessageBatch<{ jobId?: string; caseId?: string; revision?: number }>,
    env: JobEnvironment,
  ) {
    for (const message of batch.messages) {
      if (
        typeof message.body?.caseId === "string" &&
        Number.isInteger(message.body.revision)
      ) {
        await runCase(env, message.body.caseId, message.body.revision!);
        message.ack();
        continue;
      }
      if (typeof message.body?.jobId !== "string") {
        message.ack();
        continue;
      }
      await runJob(env, message.body.jobId);
      message.ack();
    }
  },
  async scheduled(_controller: ScheduledController, env: JobEnvironment) {
    // Expired leases become retryable; do not silently spend again after an uncertain call.
    await new Repository(env.DB).expireJobs();
    await new WorkRepository(env.DB).expire();
    await dispatchCases(env);
    await dispatchPending(env);
  },
} satisfies ExportedHandler<
  BackendEnv,
  { jobId?: string; caseId?: string; revision?: number }
>;
