# First lab: the job that ran twice

An original scenario; it does not summarize a particular book.

## Brief

You are building a document-processing service. A user uploads a file, a background worker generates a report, and the user sees its status. A worker sometimes finishes generating a report but crashes before acknowledging its queue message. The message is delivered again.

Constraints: jobs may be retried, a user may intentionally request a fresh report, model calls cost money, and partial failures must be recoverable.

## Senior-level complication

Two consumer versions overlap during deployment. The AI provider has no idempotency key support. A completed report must remain readable while regeneration runs. A new report format requires a schema migration, and operators need to replay failed work without corrupting completed results.

Explain how versioned job identity interacts with deployment, how a stale worker is prevented from publishing, what guarantees are achievable around paid model calls, and how an operator can safely replay a job. State the workload assumptions behind your design.

## Learner task

Draw the state transitions and explain how you would prevent duplicate visible reports while allowing intentional regeneration. Specify what “the same job” means, which data must be unique, and how abandoned work becomes retryable.

Then introduce a second failure: the database commit succeeds, but sending the queue message fails. How does the job eventually run?

## Deliverable

A short ADR covering the chosen identity, persistent states, database constraints, failure recovery, alternatives, and a test plan, rollout/rollback steps, and an operator recovery procedure. Code is optional in the first product version.

## Review rubric

Score each criterion from 0 (missing), through 1 (identified) and 2 (workable), to 3 (justified with failure evidence).

| Criterion | Strong evidence |
| --- | --- |
| Identity | Stable job key plus an explicit version for intentional regeneration |
| Concurrency | Database-enforced uniqueness and a conditional claim or equivalent |
| Recovery | Expiring claims and safe takeover after a crash |
| Side effects | Explains duplicate inference risk and distinguishes it from duplicate publication |
| Dispatch | Durable intent/outbox and recovery for a lost queue send |
| Testing | Duplicate delivery, concurrent consumers, crashes around commits, and regeneration |
| Tradeoffs | States remaining failure windows and operational cost |

Accept equivalent defensible designs. Feedback must identify evidence and gaps rather than enforce a single implementation.

## Hint progression

1. Which operation makes the report visible to the user?
2. Can two workers both believe they own the same job?
3. Which durable record survives a failed queue send?

## Transfer exercise

A week later, ask the learner to apply the same ideas to duplicate webhook processing. Can they explain which side effects can be deduplicated and which require cooperation from another system?
