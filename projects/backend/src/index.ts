import { handleApi } from "./api";
import { Repository } from "@edu/database";
import { dispatchPending, runJob, type JobEnvironment } from "./jobs";
export default {
  fetch(request: Request, env: BackendEnv) {
    return handleApi(request, env);
  },
  async queue(batch: MessageBatch<{ jobId: string }>, env: JobEnvironment) {
    for (const message of batch.messages) {
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
    await dispatchPending(env);
  },
} satisfies ExportedHandler<BackendEnv, { jobId: string }>;
