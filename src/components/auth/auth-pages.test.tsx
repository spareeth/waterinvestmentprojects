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
vi.mock("@/app/(account)/actions", () => ({
  acceptTermsAction: vi.fn(),
  signOutAction: vi.fn(),
  startEnrolmentAction: vi.fn(),
  confirmEnrolmentAction: vi.fn(),
}));

describe("sign-in screens", () => {
  it("asks for email and password, with labelled fields", () => {
    render(<SignInPage />);
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
    expect(screen.getByText(/authenticator app/)).toBeInTheDocument();
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

  it("uses no em dashes in visible copy or the terms", () => {
    const { container } = render(
      <>
        <SignInPage />
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
