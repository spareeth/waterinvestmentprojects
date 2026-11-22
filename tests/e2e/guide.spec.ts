import { expect, test } from "@playwright/test";

test("the user guide opens from the landing page without signing in", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "User guide" })
    .click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "User guide" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Guide contents" })
    .getByRole("link", { name: "Investors and operators" })
    .click();
  await expect(page).toHaveURL(/#investors$/);
});

test("the user guide is linked from the sign-in page and fits a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/sign-in");
  // Below the md breakpoint the header links sit in the menu sheet (styling pass, 22 Nov).
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "User guide" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "User guide" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
