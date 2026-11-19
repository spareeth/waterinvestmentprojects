import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { totp } from "../totp";

// Sign-in journeys against the running app and its database (PLAN v0.3, 0a): invitation, password, investor
// acknowledgement, portal, sign-out and sign-in again. Sign-in is email and password only by default
// (AUTH_SECOND_STEP=none). The journey with an authenticator app runs only when the tests and the server are
// started with AUTH_SECOND_STEP=totp, for example:
//   AUTH_SECOND_STEP=totp PORT=3123 APP_URL=http://localhost:3123 npm run test:e2e

interface Fixture {
  token: string;
  inviteeEmail: string;
  totpToken: string;
  totpInviteeEmail: string;
  pendingEmail: string;
  password: string;
}

const SECOND_STEP = process.env.AUTH_SECOND_STEP === "totp" ? "totp" : "none";

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

async function acceptInvitation(page: Page, token: string, email: string) {
  await page.goto(`/invitation/${token}`);
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  await page.getByLabel("Full name").fill("Invited Investor");
  await page.getByLabel("Choose a password").fill(data.password);
  await page.getByLabel("Repeat the password").fill(data.password);
  await page.getByRole("button", { name: "Create account" }).click();
}

/** Investors see no project before accepting the investor acknowledgement (CLAUDE.md). */
async function acceptInvestorAcknowledgement(page: Page) {
  await expect(page).toHaveURL(/\/acknowledgement$/);
  for (const path of ["/home", "/pipeline"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/acknowledgement$/);
  }
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await expectPipeline(page);
}

/** Investors land on the pipeline (/home sends them there). */
async function expectPipeline(page: Page) {
  await expect(page).toHaveURL(/\/pipeline$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Project pipeline" }),
  ).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/signed-out$/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in$/);
}

test("the portal is closed to visitors who are not signed in", async ({
  page,
}) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("an invited investor creates the account and accepts the acknowledgement", async ({
  page,
}) => {
  test.skip(
    SECOND_STEP !== "none",
    "Covers the default sign-in without a second step",
  );
  await acceptInvitation(page, data.token, data.inviteeEmail);
  await acceptInvestorAcknowledgement(page);
  await signOut(page);

  // Email and password are enough to sign in again, and the acknowledgement is not asked twice.
  await signIn(page, data.inviteeEmail, data.password);
  await expectPipeline(page);
});

test("the invitation link works only once", async ({ page }) => {
  test.skip(SECOND_STEP !== "none", "Uses the invitation accepted above");
  await page.goto(`/invitation/${data.token}`);
  await expect(
    page.getByRole("heading", { name: "Invitation already used" }),
  ).toBeVisible();
});

test("with an authenticator app required, the investor sets it up before anything else", async ({
  page,
}) => {
  test.skip(
    SECOND_STEP !== "totp",
    "Runs only with AUTH_SECOND_STEP=totp for the tests and the server",
  );
  await acceptInvitation(page, data.totpToken, data.totpInviteeEmail);

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

  await acceptInvestorAcknowledgement(page);
  await signOut(page);

  // Signing in again asks for the code from the app.
  await signIn(page, data.totpInviteeEmail, data.password);
  await expect(page).toHaveURL(/\/sign-in\/two-factor$/);
  await page.getByLabel("Code from your authenticator app").fill("000000");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(formAlert(page)).toContainText("did not work");
  await page.getByLabel("Code from your authenticator app").fill(totp(secret));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expectPipeline(page);
});

test("an account waiting for approval sees only the pending screen", async ({
  page,
}) => {
  await signIn(page, data.pendingEmail, data.password);
  await expect(page).toHaveURL(/\/pending$/);
  for (const path of ["/home", "/pipeline", "/acknowledgement"]) {
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
