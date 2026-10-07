import { expect, test } from "@playwright/test";
import { createProjectViaUi, login } from "./fixtures";

test("pinned projects sit at the top of the sidebar and stay there", async ({ page }) => {
  await login(page);
  const suffix = crypto.randomUUID().slice(0, 4);
  const first = `Pin Alpha ${suffix}`;
  const second = `Pin Beta ${suffix}`;
  await createProjectViaUi(page, first, `pa${suffix}`.slice(0, 5));
  await createProjectViaUi(page, second, `pb${suffix}`.slice(0, 5));

  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  const pinnedList = nav.getByRole("list", { name: "Angepinnte Projekte" });
  await expect(pinnedList.getByRole("link", { name: new RegExp(second) })).toHaveCount(0);

  // Pin from the project header; the sidebar moves it up.
  await page.getByRole("main").getByRole("button", { name: `${second} anpinnen` }).click();
  await expect(pinnedList.getByRole("link", { name: new RegExp(second) })).toBeVisible();
  await expect(nav.getByRole("link", { name: new RegExp(second) })).toHaveCount(1);

  // Still pinned after a reload, on another device-less page too, and first in the overview.
  await page.goto("/projects");
  await expect(pinnedList.getByRole("link", { name: new RegExp(second) })).toBeVisible();
  const names = await page.getByRole("region", { name: "Projektliste" }).getByRole("heading", { level: 2 }).allTextContents();
  expect(names[0]).toBe(second);
  await expect(page.getByRole("region", { name: "Projektliste" }).getByRole("button", { name: `${second} nicht mehr anpinnen` })).toHaveAttribute("aria-pressed", "true");

  // Pin another from its sidebar row (shown on hover), unpin the first from the overview.
  const row = nav.getByRole("listitem").filter({ hasText: first });
  await row.hover();
  await row.getByRole("button", { name: `${first} anpinnen` }).click();
  await expect(pinnedList.getByRole("link", { name: new RegExp(first) })).toBeVisible();
  await page.getByRole("region", { name: "Projektliste" }).getByRole("button", { name: `${second} nicht mehr anpinnen` }).click();
  await expect(pinnedList.getByRole("link", { name: new RegExp(second) })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: new RegExp(second) })).toHaveCount(1);
});
