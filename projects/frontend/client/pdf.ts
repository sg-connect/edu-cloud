import {
  MAX_PDF_BYTES,
  MAX_PAGES,
  type ChapterInput,
  type PageText,
} from "@edu/contracts";
export async function extractPdf(
  file: File,
  onProgress: (message: string) => void,
) {
  if (file.size > MAX_PDF_BYTES) throw new Error("Choose a PDF up to 20 MB.");
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } =
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > MAX_PAGES)
      throw new Error("This version supports books up to 600 pages.");
    const pages: PageText[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress(`Reading page ${i} of ${pdf.numPages}…`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item
            ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ")
            : "",
        )
        .join("")
        .trim();
      if (text.length > 30000)
        throw new Error(`Page ${i} contains too much text for this version.`);
      pages.push({ page: i, text });
      page.cleanup();
    }
    const chars = pages.reduce((n, p) => n + p.text.length, 0);
    if (chars < 80)
      throw new Error(
        "No readable text found. Scanned PDFs need OCR, which is not supported yet.",
      );
    if (chars > 3000000)
      throw new Error(
        "This book has too much text for the first version. Upload a smaller PDF.",
      );
    const outline = await pdf.getOutline();
    const starts: { title: string; page: number }[] = [];
    for (const item of outline || []) {
      try {
        const dest =
          typeof item.dest === "string"
            ? await pdf.getDestination(item.dest)
            : item.dest;
        if (!dest?.length) continue;
        const page =
          typeof dest[0] === "number"
            ? dest[0] + 1
            : (await pdf.getPageIndex(dest[0])) + 1;
        if (page >= 1 && page <= pdf.numPages)
          starts.push({ title: item.title.slice(0, 180), page });
      } catch {
        /* An unusable bookmark is skipped; editable page ranges remain available. */
      }
    }
    if (starts.length === 0) {
      for (const page of pages) {
        const match = page.text.match(
          /^(?:chapter\s+\d+[^\n]*|\d+\.\s+[A-Z][^\n]{3,100})/im,
        );
        if (match)
          starts.push({ title: match[0].slice(0, 180), page: page.page });
      }
    }
    let chapters: ChapterInput[] = [];
    const sorted = starts
      .sort((a, b) => a.page - b.page)
      .filter((x, i, a) => i === 0 || x.page !== a[i - 1].page)
      .slice(0, 100);
    if (sorted.length) {
      if (sorted[0].page > 1)
        sorted.unshift({ title: "Opening pages", page: 1 });
      chapters = sorted.map((s, i) => ({
        title: s.title,
        start_page: s.page,
        end_page: (sorted[i + 1]?.page || pdf.numPages + 1) - 1,
      }));
    } else {
      // Honest fallback: page groups are not presented as detected chapters.
      let start = 1,
        count = 0;
      for (const p of pages) {
        if (
          count > 0 &&
          (count + p.text.length > 55000 || p.page - start >= 15)
        ) {
          chapters.push({
            title: `Pages ${start}–${p.page - 1}`,
            start_page: start,
            end_page: p.page - 1,
          });
          start = p.page;
          count = 0;
        }
        count += p.text.length;
      }
      chapters.push({
        title: `Pages ${start}–${pdf.numPages}`,
        start_page: start,
        end_page: pdf.numPages,
      });
    }
    return {
      title: file.name.replace(/\.pdf$/i, "").replace(/[_-]/g, " "),
      pages,
      chapters,
    };
  } finally {
    await task.destroy();
  }
}
