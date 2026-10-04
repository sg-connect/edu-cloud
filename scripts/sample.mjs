import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const pages = [
  [
    "Chapter 1: Design for retries",
    [
      "A queue can deliver the same job more than once. A worker may finish a report and crash before acknowledging its message. Retrying the message should not create a second visible report.",
      "Give each logical job a stable identity. Store that identity with a uniqueness constraint, and distinguish a retry from an intentional request to regenerate a report. A regenerated report needs a new version.",
      "A database constraint is stronger than checking for an existing row in application code. Two workers can both observe an empty result before either inserts. The constraint makes the invariant survive concurrency.",
      "There is still a boundary around external side effects. If an AI provider has no idempotency support, a crash after a model call may cause a repeated charge. Deduplicating publication does not guarantee exactly one paid call.",
      "Before adding a distributed lock, state the invariant and list the failure windows. Simpler persistent state and conditional updates may be enough. Test a crash immediately before and after each durable write.",
    ],
  ],
  [
    "Chapter 2: Make change reversible",
    [
      "A schema migration is a transition between versions of a running system. During a rolling deployment, old and new application versions may share the same database. Both versions must tolerate the intermediate schema.",
      "Use an expand-and-contract migration when compatibility matters. First add the new shape without removing the old one. Deploy code that can work with both shapes, backfill existing data, verify the result, and remove the old shape in a later release.",
      "A rollback of application code does not undo data changes. Define what happens if the new code writes values the old code cannot interpret. Preserve a recovery path until the transition has been verified.",
      "Observability is part of the migration design. Record remaining old-format rows, conversion failures, and read fallbacks. A successful deployment is not evidence that a backfill is complete.",
      "The cost of this approach is temporary complexity. For a disposable prototype with no users, a simpler migration may be appropriate. Choose the process from the consequence of failure, not from habit.",
    ],
  ],
  [
    "Chapter 3: Measure before optimizing",
    [
      "Performance work starts with a user-visible objective and a representative workload. A faster isolated function may have little effect on the time a user waits for a page or report.",
      "Measure the critical path before choosing an optimization. Separate time spent waiting on the network, querying data, performing computation, and rendering. Preserve the workload and compare before and after measurements.",
      "Averages can hide the experience of slow requests. Inspect the distribution and explain whether the system should optimize typical latency, tail latency, throughput, or cost.",
      "Caching trades freshness and invalidation complexity for lower repeated work. Identify which data can be stale and for how long. Private data must not leak through a shared cache key.",
      "An optimization should include a correctness check and a rollback path. If a change makes the system faster by silently skipping necessary work, it has changed the product rather than improved the implementation.",
    ],
  ],
];
for (const [title, paragraphs] of pages) {
  const page = pdf.addPage([612, 792]);
  page.drawText("EDU-CLOUD / ORIGINAL SAMPLE", {
    x: 55,
    y: 745,
    font,
    size: 9,
    color: rgb(0.4, 0.5, 0.4),
  });
  page.drawText(title, { x: 55, y: 700, font: bold, size: 19 });
  let y = 660;
  for (const paragraph of paragraphs) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      if (font.widthOfTextAtSize(line + word, 11) > 490) {
        page.drawText(line, { x: 55, y, font, size: 11 });
        y -= 17;
        line = "";
      }
      line += word + " ";
    }
    if (line) {
      page.drawText(line, { x: 55, y, font, size: 11 });
      y -= 17;
    }
    y -= 18;
  }
  page.drawText(
    `Original educational sample. PDF page ${pdf.getPageCount()}.`,
    { x: 55, y: 45, font, size: 9, color: rgb(0.5, 0.5, 0.5) },
  );
}
await mkdir("projects/frontend/public", { recursive: true });
await writeFile("projects/frontend/public/sample.pdf", await pdf.save());
console.log("Generated original sample PDF.");
