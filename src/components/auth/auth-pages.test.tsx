import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SecondStepPage from "@/app/(auth)/sign-in/two-factor/page";
import SignInPage from "@/app/(auth)/sign-in/page";
import SignedOutPage from "@/app/(auth)/signed-out/page";
import { TERMS_SECTIONS } from "@/lib/auth/terms";
import { TermsForm } from "./terms-form";

// The forms post to server actions; the pages only need something to bind to.
vi.mock("@/app/(auth)/actions", () => ({
  signInAction: vi.fn(),
  secondStepAction: vi.fn(),
  acceptInvitationAction: vi.fn(),
  registerAction: vi.fn(),
}));
// The sign-in page sends someone who is already signed in straight on; these tests are signed out.
vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: vi.fn(async () => null),
  stagePathForUser: vi.fn(async () => "/home"),
}));
vi.mock("@/app/(account)/actions", () => ({
  acceptTermsAction: vi.fn(),
  signOutAction: vi.fn(),
  startEnrolmentAction: vi.fn(),
  confirmEnrolmentAction: vi.fn(),
}));
// M13: the sign-in page reads whether investor registration is open.
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ SELF_REGISTRATION_ENABLED: true }),
}));

function signedOut(as?: string) {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve(as ? { as } : {}),
  } as Parameters<typeof SignInPage>[0];
}

describe("sign-in screens", () => {
  it("asks for email and password, with labelled fields", async () => {
    render(await SignInPage(signedOut()));
    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "autocomplete",
      "username",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
    // PLAN 0a.3 and 0a.4: email and password only; forgotten passwords are reset by the Summit team.
    expect(screen.getByText(/temporary/)).toBeInTheDocument();
    expect(screen.queryByText(/authenticator app/)).not.toBeInTheDocument();
  });

  it("offers the three ways in over one form, and registration to investors (M13)", async () => {
    render(await SignInPage(signedOut("investor")));
    const options = screen.getByRole("navigation", {
      name: "I am signing in as",
    });
    for (const [label, as] of [
      ["Government or country", "country"],
      ["Investor or operator", "investor"],
      ["Summit team", "team"],
    ]) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        `/sign-in?as=${as}`,
      );
    }
    expect(
      screen.getByRole("link", { name: "Investor or operator" }),
    ).toHaveAttribute("aria-current", "true");
    expect(options).toHaveTextContent(
      /email address and password you registered/,
    );
    expect(screen.getByRole("link", { name: "Register here" })).toHaveAttribute(
      "href",
      "/register",
    );
    // Only one sign-in form, whatever the choice.
    expect(screen.getAllByLabelText("Password")).toHaveLength(1);
  });

  it("does not offer registration to governments or the Summit team", async () => {
    render(await SignInPage(signedOut("country")));
    expect(screen.queryByRole("link", { name: "Register here" })).toBeNull();
    expect(screen.getByText(/upload link/)).toBeInTheDocument();
  });

  it("asks for the second step with a one-time code field", () => {
    render(<SecondStepPage />);
    expect(
      screen.getByLabelText("Code from your authenticator app"),
    ).toHaveAttribute("autocomplete", "one-time-code");
    expect(
      screen.getByRole("button", { name: "Use a backup code instead" }),
    ).toBeInTheDocument();
  });

  it("confirms sign-out", () => {
    render(<SignedOutPage />);
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  it("requires ticking the terms box", () => {
    render(<TermsForm />);
    expect(screen.getByRole("checkbox")).toBeRequired();
  });

  it("uses no em dashes in visible copy or the terms", async () => {
    const signIn = await SignInPage(signedOut());
    const { container } = render(
      <>
        {signIn}
        <SecondStepPage />
        <SignedOutPage />
        <TermsForm />
      </>,
    );
    expect(container.textContent).not.toContain("—");
    for (const section of TERMS_SECTIONS) {
      expect(section.heading + section.body).not.toContain("—");
    }
  });
});

describe("sign-in page when already signed in", () => {
  it("sends the person straight on instead of asking again", async () => {
    const session = await import("@/lib/auth/session");
    vi.mocked(session.getCurrentSession).mockResolvedValueOnce({
      user: { id: "u1" },
    } as Awaited<ReturnType<typeof session.getCurrentSession>>);
    vi.mocked(session.stagePathForUser).mockResolvedValueOnce("/pipeline");
    await expect(SignInPage(signedOut())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(session.stagePathForUser).toHaveBeenCalledWith("u1");
  });
});
