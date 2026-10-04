# edu-cloud

**Turn engineering books into understanding and practice.**

A local learning workspace for senior software engineers. Upload a PDF, review its chapters, analyze a chapter with OpenAI, and collect source-linked principles into learning tracks.

## Run locally

Requires Node.js 22.22.3 or newer within Node 22 and npm.

```sh
npm ci
cp .env.example .env
# Set OPENAI_API_KEY in .env. Keep an existing .env if already configured.
npm run types
npm run dev
```

Open **http://127.0.0.1:3400**. Use **Explore a sample chapter** to try the original three-page engineering sample, or upload a text-based PDF.

`npm run dev` generates the sample, applies local D1 migrations, and starts both Workers through the Cloudflare Vite plugin. No Cloudflare login or hosted resources are needed. OpenAI analysis is a real, billable API call; uploads and reading do not call OpenAI.

Local D1, R2, and queue state lives in ignored `.wrangler/state/`. The app uses a gitignored `.env`; restart after changing its key or model. The key is accessed only by server code and never returned to the browser. `.env.example` contains placeholders only.

## Three Nx projects

| Project    | Responsibility                                                                              |
| ---------- | ------------------------------------------------------------------------------------------- |
| `frontend` | Next.js App Router interface via vinext, PDF extraction in the browser, thin API forwarding |
| `backend`  | Cloudflare Worker: input validation, R2 operations, OpenAI calls, queue handling, recovery  |
| `database` | D1 repositories, SQL migrations, durable job state                                          |

```text
Browser → frontend Worker → backend Worker → database repository → D1
                                    ├── R2: private PDFs and extracted pages
                                    └── Queue → backend queue handler → OpenAI
```

Small shared contracts live in `shared/`. The frontend has no D1/R2 bindings or SQL. `npm run check:boundaries` checks the architectural boundaries. Development uses Cloudflare's workerd/Miniflare runtime, with persistent local D1, R2, and Queues.

## Practice cases

Open **Practice cases → New practice case**. Paste the task, architecture, stack, code excerpts, team practices, and constraints prepared in your company Claude conversation. Optionally describe your proposed solution. Save the case, then choose **Analyze practice case** for educational suggestions about your approach, risks, questions, and a critique with a revised proposal. These cases are part of your ongoing engineering education.

Saving is local. Analysis sends the case and selected learning context to OpenAI with `store: false`, using your configured key. The app scans all completed chapter analyses, extracted principles, and personal chapter notes, prioritizes relevant entries with keyword matching, and sends up to 24 entries within a 48,000-character source budget. Saved principles receive a ranking boost. Reports show searched/selected counts and link sources back to their chapters. Unanalyzed PDF text is not searched; this first version does not use semantic/vector retrieval. Advice without references is labeled general engineering guidance.

Cases allow 24,000 characters of context and 12,000 for a proposed solution. Each saved revision, completed review, and failed review is retained in **Learning history**, including the context and proposed approach at that time. Editing marks the previous report stale without removing it. Analyze again to review the revised case or refresh its learning sources. Queue processing survives navigation; interrupted reviews can be retried. Source snippets are saved with the report, so deleting a book does not erase earlier work-case references (chapter links then become unavailable). Deleting a case explicitly removes its entire history. Existing cases and their latest reports are imported into history; versions overwritten before this feature cannot be reconstructed.

## Available now

- PDF import, bookmark/heading-based chapter discovery, and editable page ranges.
- Chapter reader with extracted source text and links to the original PDF.
- Background OpenAI analysis: overview, principles, applications, tradeoffs, and reflection questions.
- Evidence validation: every principle's short excerpt must match its cited PDF page. This does not guarantee the interpretation is correct.
- Persistent chapter notes, custom tracks, saved principles, and applied/not-applied tracking.
- Job deduplication, claim leases, retry controls, and stale-result protection.
- Responsive library, chapter workspace, tracks, and principle notebook.

## Development commands

```sh
npm run dev                # Local app and background Worker on port 3400
npm run typecheck          # Check all three Nx projects
npm test                   # Backend validation + real local D1 repository tests
npm run test:e2e           # Browser tests; starts local app if needed
npm run check:boundaries   # Check frontend/backend/database separation
npm run build              # Build web + backend; backend packaging is dry-run only
npm start                  # Preview the production build locally on port 3400
npx nx show projects
npx nx graph
```

Run `npx playwright install chromium` once before browser tests. Automated tests mock AI responses and do not spend API credits. The browser tests use the local app and clean up their own sample book/track.

## Current scope

This is a **single-user, localhost-only prototype**. Hosting is a later step: add authentication and ownership checks, real resource IDs, deployed secrets, and operational limits first. No Cloudflare resources have been provisioned or deployed.

Text-based PDFs up to 100 MB / 600 pages are supported, with extraction limits. Scanned PDFs, OCR, EPUB, chapter chat, cross-book search, and executable exercises are not implemented. Large chapters are automatically analyzed in sections of up to 65,000 extracted characters. Each section uses a separate OpenAI call; completed sections are reused on retry. Chapter outlines lock once analysis or notes exist. Saved principles form tracks in insertion order; drag reordering is not implemented.

Use material you have permission to process. Private books, extracted text, generated analyses, secrets, and local state never belong in this public repository. No project license has been selected yet.

## More detail

- [Architecture and local/cloud boundary](docs/architecture.md)
- [Local development and verification](docs/local-development.md)
- [Product direction](docs/product.md)
- [Source-analysis design](docs/content-pipeline.md)
- [Roadmap](docs/roadmap.md)
- [Example practical lab](docs/first-lab.md)
