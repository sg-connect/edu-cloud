import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
test("PDF import, chapter outline, source, notes and tracks persist", async ({
  page,
  request,
}) => {
  const title = `E2E book ${Date.now()}`;
  const trackTitle = `E2E track ${Date.now()}`;
  try {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /A little reading/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add a book", exact: true }),
    ).toBeEnabled();
    await page.locator("input[type=file]").setInputFiles({
      name: `${title}.pdf`,
      mimeType: "application/pdf",
      buffer: await readFile("projects/frontend/public/sample.pdf"),
    });
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Chapter 1: Design for retries/ }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Source text" }).click();
    await expect(
      page.getByText(/A queue can deliver the same job more than once/),
    ).toBeVisible();
    await page.getByRole("tab", { name: "My notes" }).click();
    await page
      .getByRole("textbox", { name: "Chapter notes" })
      .fill("A retry must preserve the same logical job identity.");
    await page.getByRole("button", { name: "Save notes" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Notes saved." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to library" }).click();
    await page.reload();
    await page.getByRole("button", { name: title, exact: true }).last().click();
    await page.getByRole("tab", { name: "My notes" }).click();
    await expect(
      page.getByRole("textbox", { name: "Chapter notes" }),
    ).toHaveValue("A retry must preserve the same logical job identity.");
    await page
      .getByRole("button", { name: "Learning tracks", exact: true })
      .click();
    await page.getByRole("button", { name: "New track" }).click();
    await page.getByLabel("What would you like to explore?").fill(trackTitle);
    await page
      .getByRole("button", { name: "Create track", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: trackTitle })).toBeVisible();
  } finally {
    const headers = { origin: "http://127.0.0.1:3400" };
    const books = await (await request.get("/api/books")).json();
    for (const b of books)
      if (b.title === title)
        await request.delete(`/api/books/${b.id}`, { headers });
    const tracks = await (await request.get("/api/tracks")).json();
    for (const t of tracks)
      if (t.title === trackTitle)
        await request.delete(`/api/tracks/${t.id}`, { headers });
  }
});
test("mobile library has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Add a book", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
