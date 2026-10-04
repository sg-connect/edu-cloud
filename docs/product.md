# Product concept

## Problem and hypothesis

AI makes producing code easier. Our product hypothesis is that developers still need deliberate practice in requirements, tradeoffs, correctness, maintenance, and operating software. We should validate that need with developers rather than assume AI necessarily weakens engineering skill.

Confirmed first audience: **senior software engineers**. Assume fluency in building and shipping applications. Focus on judgment under ambiguity, architecture evolution, operational responsibility, and reviewing AI-generated systems. Foundational explanations are optional refreshers, not the main learning path.

Promise: **Build the judgment to understand, challenge, and own software—even when AI writes much of it.**

## Product experience

The book is the starting point. A senior engineer uploads a PDF or supported book file, checks the detected chapter structure, and works through chapters with an AI reading companion. The goal is to understand the author's principles, examine their assumptions, and apply them to real engineering decisions.

Core journey:

1. Upload a book and record its title, edition, ownership, and processing permissions.
2. Preview the extracted table of contents and correct chapter boundaries when needed.
3. Open a chapter with the original pages and an analysis panel alongside them.
4. Read a concise explanation, key arguments, terminology, and principle cards with page references.
5. Ask questions such as “Why does this matter?”, “When would this fail?”, or “How does this apply to a multi-tenant service?”
6. Inspect examples and counterexamples. Distinguish what the author says from the AI's interpretation.
7. Apply a principle to a short senior-level design scenario or the learner's own context.
8. Save notes, questions, and a decision; revisit weak concepts later.

Analyze a selected chapter on demand. Offer whole-book processing explicitly with progress and usage estimates; do not silently analyze hundreds of pages on upload. A whole-book synthesis should connect completed chapter analyses and disclose unprocessed chapters.

The initial upload target is text-based PDF. EPUB is a later supported format; scanned or encrypted documents need explicit handling rather than fabricated extraction. Readers can correct extraction and reanalyze affected chapters.

## Curriculum map

| Area | Practical question | Evidence |
| --- | --- | --- |
| Requirements | What does success mean, and what can fail? | Acceptance criteria and constraints |
| Fundamentals | Which data structure fits the workload? | Complexity estimate and measured example |
| Design | Where should responsibilities and dependencies live? | Module boundaries and a change exercise |
| Data | Which invariants must always hold? | Schema, constraints, migration plan |
| Distributed systems | What happens after a timeout or duplicate delivery? | Retry and idempotency design |
| Testing | Which evidence would expose an incorrect implementation? | Tests, counterexamples, and failure injection |
| Security | Who may perform this action on this object? | Threat model and authorization cases |
| Operations | How will we detect and recover from failure? | Metrics, alert, and recovery runbook |
| Performance and cost | Which bottleneck matters under this workload? | Measurement and capacity estimate |
| Engineering communication | Why this option under these constraints? | ADR with alternatives and consequences |
| AI-assisted work | How do we verify generated changes? | Review findings and verification evidence |

Teach principles as context-dependent tools. A learner should be able to explain when a familiar pattern is unnecessary or harmful.

## Tracks

A track is a lightweight ordered collection of chapters, saved principles, and optional application questions. It can span multiple books. Start with manually curated tracks; AI can suggest a sequence for the learner to edit. Track links never grant access to another user's private books. A shared track can show reading references while private material stays private.

Candidate tracks for senior engineers:

- Software architecture and design tradeoffs.
- Distributed systems and data consistency.
- Maintainability, refactoring, and safe evolution.
- Reliability and production engineering.
- Technical leadership and AI-assisted engineering review.

Example: **Reliable distributed systems** → selected chapters on failures → retry/idempotency principles → duplicate-job scenario → a saved design decision. Reading progress and demonstrated understanding are shown separately; opening a chapter does not prove mastery.

## Initial screens

- **Tracks:** ordered chapter and principle collections with a learning goal and progress.
- **My library:** private books, processing progress, and resume-reading actions.
- **Book overview:** metadata, editable chapter outline, and analysis status by chapter.
- **Chapter workspace:** source pages, explanation, principles, questions, and discussion.
- **Principle notebook:** saved principles linked to chapters, personal notes, and applications.
- **Practice:** optional exercises generated from the selected chapter and reviewed against explicit criteria.
- **Review:** unresolved questions and concepts to revisit.

## Differentiation to test

The central unit is a chapter understood through its principles, assumptions, and applications. A summary is the entry point; source-grounded discussion and practical reasoning make the experience useful. Feedback points to specific evidence in the learner's answer and accepts multiple defensible solutions.

## Validation

Recruit a small pilot group of senior engineers. Observe whether they can upload a book, verify a chapter analysis, explain a principle in their own words, and apply it to a fresh scenario a week later. Track hint usage and perceived usefulness, but avoid treating time spent or generated text volume as learning outcomes.

Possible business model later: a free foundational track and paid guided paths or team mentoring. Validate learning value before introducing billing.

## Naming candidates

| Name | Strength | Tradeoff |
| --- | --- | --- |
| Engineering Workshop | Immediately conveys practical work | Broad and descriptive |
| DevFoundry | Short, maker-oriented | Meaning needs a tagline |
| Engineer's Compass | Emphasizes judgment and direction | Longer brand |
| Software Craft Lab | Clear practice-oriented positioning | Less concise |
| edu-cloud | Useful working repository name | Does not explain the learning promise |

No trademark, domain, or product-name availability assessment has been performed. Keep the repository name while testing positioning.
