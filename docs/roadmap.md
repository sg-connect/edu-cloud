# Roadmap and decisions

## Phase 0 — Validate one chapter

Confirmed audience: senior software engineers. Confirmed core journey: upload PDFs/books, analyze chapters, and understand engineering principles. Select one permitted text-based PDF and manually assess extraction, chapter boundaries, explanations, and citations. The included duplicate-job lab illustrates a possible application exercise; it is not the primary onboarding experience.

## Phase 1 — Complete the book-to-understanding loop

Keep one app and one background Worker in a single package, with feature folders and direct Cloudflare bindings from server code. Build authentication, a private library, PDF upload, resumable extraction, editable chapter outlines, on-demand chapter analysis, source-linked discussion, notes, saved principles, and simple manually ordered tracks. Use Next.js conventions on Workers, D1, R2, Queues, and Workers AI. Keep Workflows optional until the ingestion pipeline needs durable multi-step orchestration. Spike PDF extraction first: if the parser exceeds the Workers runtime or needs native dependencies, use a narrowly scoped Container parser. Show a clear unsupported/needs-review status for scanned, encrypted, or badly extracted PDFs until supported.

Exit: a senior engineer can upload a permitted PDF, correct its chapters, inspect an analysis against the source, discuss a principle, and save an application note. Verify access isolation, retry recovery, long-chapter handling, citation integrity, and deletion. Benchmark model output against human review.

## Phase 2 — Deeper understanding

Add chapter-derived exercises, compare author claims across chapters, track unresolved questions, and revisit concepts. Add whole-book synthesis with explicit coverage and cost controls. Evaluate transfer to a fresh engineering scenario rather than rewarding summary consumption.

## Phase 3 — Broader library support

Add EPUB, OCR where needed, and cross-book retrieval with access-aware indexing. Consider Vectorize when direct chapter context is insufficient. Keep authors' differing assumptions visible. Shared curriculum requires a separate permission and editorial process.

## Phase 4 — Advanced practice

Consider isolated executable labs, collaboration, team reading groups, and mentoring based on demand. Stateful agents and hosted code execution are separate design decisions, not prerequisites for reading and discussion.

## Open decisions

- Branding: `edu-cloud` remains the repository name. Engineering Workshop, Engineer's Compass, and a book-oriented name can be tested against the clarified product.
- Login: GitHub OAuth is proposed; confirm whether an external identity provider fits the Cloudflare hosting constraint.
- Sources: choose the first permitted PDFs for extraction and analysis evaluation.
- AI: benchmark Workers AI candidates before selecting a model.
- Budget: establish an operating cap and measure cost per chapter and discussion turn.
- Licensing: select a license for original code and curriculum; third-party content retains its own terms.

## Current delivery boundary

The local PDF-to-chapter-analysis loop is implemented in three Nx projects: frontend, backend, and database. It uses local Cloudflare D1/R2/Queues and OpenAI inference, with notes and principle tracks. Authentication, chapter discussion, richer tracks, and hosted deployment remain open. No Cloudflare resources have been provisioned. See README and local-development.md for current functionality and verification.
