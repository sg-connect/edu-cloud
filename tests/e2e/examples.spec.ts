import { test, expect } from "@playwright/test";
import {
  exampleSnapshotFixture,
  exampleReportFixture,
  exampleResearchFixture,
} from "../example-fixtures";
test("examples select chapters, save a run, reopen history and distinguish hypothetical cases", async ({
  page,
}) => {
  const runs: Record<string, unknown>[] = [];
  await page.route("**/api/books", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: {
        aiConfigured: true,
        model: "fixture",
        mode: "local",
        maxPdfMB: 100,
      },
    }),
  );
  await page.route("**/api/analyzed", (r) =>
    r.fulfill({
      json: [
        {
          id: "sample-chapter",
          book_id: "sample-book",
          book_title: "Original reliability notes",
          title: "Retries",
          start_page: 1,
          end_page: 2,
          principle_count: 1,
          saved_count: 0,
          analyzed_at: "2026-10-06",
        },
      ],
    }),
  );
  await page.route("**/api/examples**", async (r) => {
    const id = new URL(r.request().url()).pathname.split("/")[3];
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      expect(body.chapter_ids).toEqual(["sample-chapter"]);
      expect(body.count).toBe(3);
      runs.push({
        id: body.id,
        book_title: exampleSnapshotFixture.book_title,
        example_count: 3,
        status: "ready",
        stage: "examples",
        model: "fixture",
        created_at: "2026-10-06 12:00:00",
        snapshot: exampleSnapshotFixture,
        result: exampleReportFixture,
        sources: exampleResearchFixture.sources,
      });
      await r.fulfill({ json: { id: body.id } });
    } else if (r.request().method() === "DELETE") {
      runs.splice(0, runs.length);
      await r.fulfill({ json: { ok: true } });
    } else await r.fulfill({ json: id ? runs.find((x) => x.id === id) : runs });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Add a book", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Real-world examples", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Real-world examples", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Find real-world examples" }),
  ).toBeDisabled();
  await page
    .getByLabel("Analyzed book", { exact: true })
    .selectOption("sample-book");
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "Find real-world examples" }).click();
  await expect(
    page.getByRole("heading", { name: "Retry scenario 3" }),
  ).toBeVisible();
  await expect(
    page.getByText("ILLUSTRATIVE · HYPOTHETICAL", { exact: true }),
  ).toHaveCount(3);
  await page.getByRole("button", { name: /My library/ }).click();
  await page
    .getByRole("button", { name: "Real-world examples", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Original reliability notes/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Retry scenario 1" }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/examples-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: ".local/examples-dark.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete run" }).click();
  await expect(
    page.getByText("Your examples will be kept here for later."),
  ).toBeVisible();
});
