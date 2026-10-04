import { test, expect } from "@playwright/test";
import { caseInput, caseReport } from "../work-case-fixtures";
test("work case context and solution persist; review shows sources and becomes stale after edits", async ({
  page,
  request,
}) => {
  const title = `E2E work case ${Date.now()}`;
  const headers = { origin: "http://127.0.0.1:3400" };
  let id: string | undefined;
  try {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Add a book", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Work cases", exact: true }).click();
    await page.getByRole("button", { name: "New work case" }).click();
    await page.getByLabel("Case title").fill(title);
    await page
      .getByLabel("Task and architecture context")
      .fill(caseInput.context);
    await page
      .getByLabel("My proposed solution (optional)")
      .fill(caseInput.proposed_solution);
    await page.getByRole("button", { name: "Save case", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Delete case" }),
    ).toBeVisible();
    const list = await (await request.get("/api/work-cases")).json();
    id = list.find((c: { title: string }) => c.title === title).id;
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Add a book", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Work cases", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await expect(
      page.getByLabel("My proposed solution (optional)"),
    ).toHaveValue(caseInput.proposed_solution);
    // Mock only the provider-backed operation: no company text or paid calls in tests.
    const saved = await (await request.get(`/api/work-cases/${id}`)).json();
    let reviewed = false;
    await page.route(`**/api/work-cases/${id}/analyze`, async (route) => {
      reviewed = true;
      await route.fulfill({ status: 202, json: { ok: true } });
    });
    await page.route(`**/api/work-cases/${id}`, async (route) => {
      if (route.request().method() === "GET" && reviewed)
        await route.fulfill({
          json: {
            ...saved,
            status: "ready",
            analyzed_revision: 1,
            result: caseReport,
          },
        });
      else await route.continue();
    });
    await page
      .getByRole("button", { name: "Analyze work case", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "A practical approach" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your solution: concerns" }),
    ).toBeVisible();
    await expect(page.getByText(/Searched 1 learning entries/)).toBeVisible();
    await page
      .getByLabel("My proposed solution (optional)")
      .fill("Use a unique operation key and handle conflicts.");
    await expect(
      page.getByText(/This review belongs to an earlier version/),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".local/work-case-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: ".local/work-case-desktop.png",
      fullPage: true,
    });
  } finally {
    if (id) await request.delete(`/api/work-cases/${id}`, { headers });
  }
});
