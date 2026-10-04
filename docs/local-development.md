# Local development

## Setup

Run `npm ci`, copy `.env.example` to `.env` only if no local file exists, set `OPENAI_API_KEY`, then run `npm run types` and `npm run dev`. The default port is 3400, leaving other local applications untouched. `OPENAI_MODEL` selects the analysis model; the verified default is `gpt-5.6-luna`.

TypeScript is pinned to 5.9.3 because the installed Nx dependency analyzer expects its JavaScript compiler API. Do not change it to the TypeScript 7 native package without verifying Nx compatibility.

The first dev start creates the original sample PDF and applies migrations. Start from the root of this repository so the root environment file and persistent storage paths are consistent.

If an API error still shows text removed from the source, stop and restart `npm run dev`. The running auxiliary backend Worker can retain older code while frontend hot reload continues. Restarting also applies pending D1 migrations; it preserves `.wrangler/state/`. Refresh the browser afterward.

## Commands and ownership

- `nx run frontend:dev`: start the integrated local frontend and backend Workers.
- `nx run frontend:build`: compile both Worker environments through Vite.
- `nx run backend:build`: package the backend with Wrangler's dry-run mode.
- `nx run database:migrate`: apply only local migrations.
- `npm run types`: regenerate both Workers' binding declarations.
- `npm run check:boundaries`: validate source dependency boundaries.

`database` is a library, not a third server. Its tests run actual D1 SQL through Miniflare.

## Persistence and secrets

`.env`, local PDFs, `.wrangler/`, `.nx/`, build outputs, screenshots, and test reports are ignored. Do not delete `.wrangler/state/` unless you intend to reset local data. Frontend build caching is disabled because local preview outputs may contain credentials. Production builds may include ignored `.dev.vars` files for local preview; never publish build directories as repository content.

The browser bundle receives no OpenAI key. Provider failures are translated into fixed user-facing messages; raw provider error bodies are not logged or returned. Automated tests use fixture keys and mocked inference. A separate live smoke test was performed on original sample text.

## Verification performed

- Three Nx project typechecks and production builds.
- Backend validation tests: page citations, chapter ranges, structured-output request, incomplete/error responses, local-origin guards.
- Miniflare/D1 integration tests: concurrent claims, stale result rejection, idempotent completion, notes, saved-principle deduplication, cascading deletion.
- Browser tests: actual PDF extraction/upload, chapter source, persisted notes, custom tracks, mobile overflow.
- Manual browser inspection of library and analyzed chapter, with no browser exceptions.
- Live OpenAI smoke test: original sample chapter produced five principles, with 499 input and 1,056 output tokens; one principle saved to a track.

## Known limitations

Local single-user only. No login, billing system, OCR, EPUB, chapter chat, cross-book search, or hosted deployment. Extraction quality depends on the PDF text layer. Chapter ranges are editable before analysis or notes are saved; afterward upload another copy for a different outline. AI citations are mechanically checked for page/excerpt matching, not for semantic correctness.

The dependency audit currently reports transitive advisories in the scaffold/tooling dependency tree. Routine `npm audit fix` does not resolve all of them; automatic suggested downgrades would change the framework/Nx major versions. Reassess the dependency tree before hosted deployment rather than blindly applying `--force`.
