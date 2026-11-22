// Screenshots for the user guide, taken from the real screens with the fictional demo data (npm run db:seed).
// Run with `npm run guide:screenshots` (scripts/guide-screenshots.sh sets up a temporary upload link for
// fictional Country A, passes its token and the demo password here, and removes the link afterwards).
// Writes public/user-guide/*.png.

import path from "node:path";
import { type Page, expect, test } from "@playwright/test";

const OUT = path.resolve(__dirname, "../../public/user-guide");
const token = process.env.GUIDE_UPLOAD_TOKEN;
const password = process.env.GUIDE_PASSWORD;

test.beforeAll(() => {
  if (!token || !password) {
    throw new Error(
      "Run through `npm run guide:screenshots` (GUIDE_UPLOAD_TOKEN and GUIDE_PASSWORD are not set).",
    );
  }
});

async function shot(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

test("sign-in", async ({ page }) => {
  await page.goto("/sign-in");
  await shot(page, "sign-in");
});

test("government upload link", async ({ page }) => {
  await page.goto(`/submit/${token}`);
  await expect(page.getByLabel("Job title")).toBeVisible();
  await shot(page, "upload-link");
});

test("investor acknowledgement", async ({ page }) => {
  // Demo investor 3 has not accepted the acknowledgement yet; the screenshot does not accept it.
  await signIn(page, "investor@bank-three.example");
  await expect(page).toHaveURL(/\/acknowledgement/);
  await shot(page, "investor-acknowledgement");
});

test("investor pipeline, project and requests", async ({ page }) => {
  await signIn(page, "investor@operator-one.example");
  await page.goto("/pipeline");
  await shot(page, "pipeline");
  // A published project this investor has not asked about yet, so the request form shows.
  await page.goto("/pipeline/seed-project-d1");
  await page.waitForTimeout(1500); // let the PDF viewer draw the teaser
  await shot(page, "project");
  await page.goto("/requests");
  await shot(page, "my-requests");
});

test("country focal point inbox", async ({ page }) => {
  await signIn(page, "focal@country-a.example");
  await page.goto("/inbox");
  await shot(page, "inbox");
});

test("summit admin submissions", async ({ page }) => {
  await signIn(page, "summit.admin@demo.example");
  await page.goto("/admin/submissions");
  await shot(page, "admin-submissions");
});
