# Books and source analysis

## Book-first experience

Upload → extract → detect chapters → confirm outline → analyze selected chapter → discuss → save principles → apply. Private chapter analysis is available to its owner after automated checks; human editorial approval is required only when promoting material into shared curriculum.

For each chapter store a short overview, argument outline, principles, assumptions, examples, counterexamples, open questions, and source references. Label author claims separately from generated interpretation and new illustrative examples. Chapter detection should combine the PDF outline/table of contents with heading structure and permit manual correction. Flag low-quality extraction instead of producing confident analysis from broken text.

## What a source becomes

A source should produce a concept map, principle cards, tradeoff notes, counterexamples, and practical exercises. A useful card answers: what problem does this principle solve, when does it apply, when does it fail, and how can a learner test it?

Every published claim derived from a source needs a verifiable locator: title, author, edition/version, and page or section. Where printed pages and PDF pages differ, preserve both. If extraction cannot establish a location, mark it unresolved and hold it for review. Never fabricate a citation from a model's recollection.

## Acquisition scope

Start with user-uploaded text-based PDFs for which processing is permitted. Candidate inputs are author-provided material, appropriately licensed works, public-domain works, and uploads for which the uploader has relevant processing permission. Public access to a URL is not itself a permission record. Buying a book does not automatically mean its text can be republished in this app.

Commercial architecture books can initially appear as bibliographic reading references. Full-text ingestion and publication remain separate permissions. No books have been downloaded or analyzed in this project yet.

Keep user uploads and derived private material scoped to their owner. A private upload never automatically becomes shared curriculum. Store permission basis, permitted uses, attribution requirements, owner, and visibility with each source. Public lesson publication requires editorial review of both content and permitted use. This is a proposed product policy, not a legal determination for any particular book.

## Processing stages

1. Register metadata, permission basis, visibility, and checksum.
2. Upload to a private R2 key; verify completion, file signature, and size.
3. Extract text with page/section mapping. Support text-based PDF in the first version; validate extraction against representative books before accepting uploads. EPUB and additional formats can follow. Scanned PDFs may require OCR and a container.
4. Create versioned chunks preserving source order and location.
5. Ask Workers AI for structured concepts, claims, caveats, and exercise drafts.
6. Validate schemas and source locators; flag unsupported claims and contradictions.
7. Save private chapter analysis and let the reader inspect citations, correct extraction, and request reanalysis.
8. For shared curriculum only, have an editor inspect source permissions, passages, learning value, and rubric before publishing an immutable lesson version. Optionally embed authorized chunks for retrieval.

Do not silently combine contradictory advice from different books. Present assumptions and explain why each recommendation might fit a different context.

## Grounded feedback

Retrieve only authorized content. Send the model a small relevant evidence set and a fixed rubric. Require criterion-level feedback, quoted learner evidence where applicable, reference IDs, uncertainty, and one actionable next step. Verify returned reference IDs against supplied passages. Unsupported source claims are withheld or explicitly marked as unverified.

Build an evaluation set of weak, strong, and unconventional-but-valid answers. Compare model reviews with human reviews, inspect consistency across repeated runs, and test prompt injection in both submissions and sources. The model is a fallible coach; users can challenge feedback.

## Deletion and lifecycle

Deleting a source first makes it unavailable for reads and new work. Background cleanup removes objects, extracted chunks, embeddings, and derived private analyses, with retryable status. In-flight jobs recheck the tombstone before writing. Published material that relies on withdrawn permissions is queued for review or unpublication. Document retention and backup behavior before accepting real user uploads.
