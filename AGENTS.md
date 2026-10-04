# edu-cloud working rules

- Keep the three Nx boundaries: frontend → backend → database. SQL and migrations belong in database; browser code must not import backend implementations or database repositories.
- Run tasks from the repository root through npm/Nx. Local app port is 3400; preserve other applications and ports.
- Cloudflare bindings are local simulations unless a task explicitly requests hosted provisioning. Do not replace D1/R2 with unrelated persistence services.
- Never display or commit .env values, provider keys, private PDFs, generated analyses, .wrangler state, or build .dev.vars files.
- OpenAI calls are real and billable. Tests use mocked inference; use only original sample text for live smoke tests unless the user requests otherwise.
- Before committing implementation changes, run npm run check and appropriate browser tests. Keep README's implementation status and limitations accurate.
- This is single-user/local-only until authentication and per-user authorization are implemented.
