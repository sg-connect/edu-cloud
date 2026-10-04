import { test, expect } from "@playwright/test";
test("analyzed collection filters across books, saves principles, and remembers theme", async ({
  page,
}) => {
  const chapter = {
    id: "c-one",
    book_id: "b-one",
    title: "Design for retries",
    start_page: 1,
    end_page: 2,
    position: 0,
    version: 1,
    status: "ready",
    error: null,
  };
  const books = [
    {
      id: "b-one",
      title: "Original reliability notes",
      filename: "sample.pdf",
      page_count: 2,
      created_at: "2026-10-04 12:00:00",
      chapter_count: 1,
      analyzed_count: 1,
    },
    {
      id: "b-two",
      title: "Original architecture notes",
      filename: "sample.pdf",
      page_count: 2,
      created_at: "2026-10-04 12:00:00",
      chapter_count: 1,
      analyzed_count: 1,
    },
  ];
  let saves = 0;
  const principles = Array.from({ length: 10 }, (_, i) => ({
    title: `Retry principle ${i + 1}`,
    explanation: "Give each operation a stable identity.",
    application: "Use a database constraint.",
    tradeoff: "Choose the right key.",
    page: 1,
    evidence: "A unique constraint protects against races.",
  }));
  await page.route("**/api/books", (r) => r.fulfill({ json: books }));
  await page.route("**/api/books/b-one", (r) =>
    r.fulfill({ json: { book: books[0], chapters: [chapter] } }),
  );
  await page.route("**/api/tracks", (r) =>
    r.fulfill({
      json: [
        {
          id: "reliability",
          title: "Reliability",
          description: "Retries",
          items: [],
        },
      ],
    }),
  );
  await page.route("**/api/chapters/c-one", (r) =>
    r.fulfill({
      json: {
        chapter,
        pages: [{ page: 1, text: "Original sample text" }],
        analysis: {
          content: {
            overview: "Design reliable retries.",
            principles,
            questions: ["What can fail?"],
          },
          model: "fixture",
          input_tokens: 1,
          output_tokens: 1,
          created_at: "2026-10-04 12:00:00",
        },
        note: "",
      },
    }),
  );
  await page.route("**/api/analyzed", (r) =>
    r.fulfill({
      json: [
        {
          ...chapter,
          book_title: books[0].title,
          analyzed_at: "2026-10-04 12:00:00",
          principle_count: 10,
          saved_count: saves,
        },
        {
          ...chapter,
          id: "c-two",
          book_id: "b-two",
          title: "Choose useful boundaries",
          book_title: books[1].title,
          analyzed_at: "2026-10-04 11:00:00",
          principle_count: 3,
          saved_count: 0,
        },
      ],
    }),
  );
  await page.route("**/api/tracks/reliability/items", async (r) => {
    expect(r.request().postDataJSON()).toEqual({
      chapterId: "c-one",
      principleIndex: 8,
    });
    saves++;
    await r.fulfill({ json: { ok: true } });
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Add a book", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Add a book", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Analyzed", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page
    .getByLabel("Filter analyzed chapters by book")
    .selectOption("b-two");
  await expect(
    page.getByRole("button", {
      name: "Review Design for retries and save principles",
    }),
  ).toHaveCount(0);
  await page.getByLabel("Filter analyzed chapters by book").selectOption("");
  await page.getByLabel("Search analyzed chapters").fill("no matches");
  await expect(
    page.getByRole("heading", { name: "No matching chapters" }),
  ).toBeVisible();
  await page.getByLabel("Search analyzed chapters").fill("");
  await page.screenshot({ path: ".local/analyzed-light.png", fullPage: true });
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(17, 26, 22)",
  );
  await page.screenshot({ path: ".local/analyzed-dark.png", fullPage: true });
  await page
    .getByRole("button", {
      name: "Review Design for retries and save principles",
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Save Retry principle 9", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".reader-content")).toHaveCSS(
    "background-color",
    "rgb(23, 34, 28)",
  );
  await page
    .getByRole("button", { name: "Save Retry principle 9", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Principle saved to your track." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to analyzed" }).click();
  await expect(
    page.getByText("1 saved to tracks", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/analyzed-dark-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Practice cases", exact: true })
    .click();
  await page.getByRole("button", { name: "New practice case" }).click();
  await expect(page.locator(".case-form")).toHaveCSS(
    "background-color",
    "rgb(23, 34, 28)",
  );
});
