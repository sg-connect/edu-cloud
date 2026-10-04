# edu-cloud

**Turn engineering books into understanding and practice.**

A proposed learning platform for senior software engineers who use AI and want to sharpen their engineering judgment: understand a problem, choose a design, test assumptions, handle failure, and explain tradeoffs.

Status: brainstorming and architecture. No application has been implemented or deployed.

Working repository name: `edu-cloud`. Product-name candidates: **Engineer’s Compass**, **PrincipleLab**, and **Engineering Workshop**. Branding is provisional.

## Start here

- [Product concept and learning experience](docs/product.md)
- [Cloudflare architecture](docs/architecture.md)
- [Books and source analysis](docs/content-pipeline.md)
- [First practical lab: duplicate jobs](docs/first-lab.md)
- [Roadmap and open decisions](docs/roadmap.md)

## The learning loop

**Upload book → verify chapters → read and discuss → understand principles → apply to a scenario → reflect → revisit.**

The chapter workspace is the core experience: source-linked explanations, principle cards, discussion, and practical applications for senior engineers. Learners produce evidence: a design note, a test plan, a failure analysis, or an architecture decision record. AI helps question and review their reasoning. Simple tracks organize chapters and principles across books.

## Infrastructure direction

All application hosting, persistence, background processing, and model inference are intended to run on Cloudflare: Next.js conventions on Workers (proposed vinext runtime), Static Assets, D1, R2, Queues, and Workers AI. Add Workflows, Vectorize, or Containers when their specific use cases arrive. GitHub hosts the public source repository.

The public repository contains original project material. Private uploads, book files, credentials, and learner data do not belong here. A project license has not yet been selected.
