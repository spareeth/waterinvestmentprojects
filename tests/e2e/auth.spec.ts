import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { totp } from "../totp";

// Full sign-in journey against the running app and its database:
// invitation, password, two-step enrolment, terms, portal, sign-out, sign-in with a code.

interface Fixture {
  token: string;
  inviteeEmail: string;
  pendingEmail: string;
  password: string;
}

function fixtures(command: "create" | "clean"): string {
  return execFileSync("npx", ["tsx", "tests/e2e/fixtures.ts", command], {
    encoding: "utf8",
  });
}

let data: Fixture;

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  fixtures("clean");
  data = JSON.parse(fixtures("create")) as Fixture;
});

test.afterAll(() => {
  fixtures("clean");
});

/** The form's error message (Next.js also has a route announcer with role="alert"). */
function formAlert(page: Page) {
  return page.locator("form").getByRole("alert");
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
}

test("the portal is closed to visitors who are not signed in", async ({
  page,
}) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("an invited investor sets up the account, two-step verification and terms", async ({
  page,
}) => {
  await page.goto(`/invitation/${data.token}`);
  await expect(page.getByLabel("Email address")).toHaveValue(data.inviteeEmail);
  await page.getByLabel("Full name").fill("Invited Investor");
  await page.getByLabel("Choose a password").fill(data.password);
  await page.getByLabel("Repeat the password").fill(data.password);
  await page.getByRole("button", { name: "Create account" }).click();

  // Two-step verification is required before anything else.
  await expect(page).toHaveURL(/\/two-factor\/setup$/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/two-factor\/setup$/);

  await page.getByLabel("Confirm your password").fill(data.password);
  await page.getByRole("button", { name: "Continue" }).click();
  const secret = (await page.getByTestId("totp-secret").innerText()).replace(
    /\s/g,
    "",
  );
  await expect(page.getByRole("list", { name: "Backup codes" })).toBeVisible();
  await page
    .getByLabel("Enter the 6-digit code shown in the app")
    .fill(totp(secret));
  await page
    .getByRole("button", { name: "Turn on two-step verification" })
    .click();

  await expect(page).toHaveURL(/\/terms$/);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Accept and continue" }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByRole("heading", { name: "Welcome, Invited Investor" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/signed-out$/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in$/);

  // Signing in again asks for the code from the app.
  await signIn(page, data.inviteeEmail, data.password);
  await expect(page).toHaveURL(/\/sign-in\/two-factor$/);
  await page.getByLabel("Code from your authenticator app").fill("000000");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(formAlert(page)).toContainText("did not work");
  await page.getByLabel("Code from your authenticator app").fill(totp(secret));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("the invitation link works only once", async ({ page }) => {
  await page.goto(`/invitation/${data.token}`);
  await expect(
    page.getByRole("heading", { name: "Invitation already used" }),
  ).toBeVisible();
});

test("an account waiting for approval sees only the pending screen", async ({
  page,
}) => {
  await signIn(page, data.pendingEmail, data.password);
  await expect(page).toHaveURL(/\/pending$/);
  for (const path of ["/home", "/terms", "/two-factor/setup"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/pending$/);
  }
});

test("a wrong password is refused without saying which part was wrong", async ({
  page,
}) => {
  await signIn(page, data.pendingEmail, "not-the-right-password");
  await expect(formAlert(page)).toHaveText(
    "The email address or password is not correct.",
  );
});
