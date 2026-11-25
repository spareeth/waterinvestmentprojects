import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { appConfig } from "@/lib/config";
import { PortalHeader } from "./portal-header";

vi.mock("@/app/(account)/actions", () => ({ signOutAction: vi.fn() }));

// Signed-in pages: the name and mark lead to the landing page (part of the portal, still signed in), the
// pipeline is always one click away, and the person's name is set apart from the menu links.
describe("PortalHeader", () => {
  it("links the mark to the landing page and always offers the pipeline", () => {
    render(<PortalHeader name="Test Person" viewer={null} />);
    expect(
      screen.getByRole("link", { name: new RegExp(appConfig.name, "i") }),
    ).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("link", { name: "Pipeline projects" }),
    ).toHaveAttribute("href", "/pipeline");
  });

  it("shows who is signed in as a badge, not as a menu link", () => {
    render(<PortalHeader name="Sajid Pareeth" viewer={null} />);
    const badge = screen.getByTestId("signed-in-user");
    expect(badge).toHaveTextContent("Signed in as Sajid Pareeth");
    expect(badge).toHaveTextContent("SP");
    expect(
      screen.queryByRole("link", { name: /sajid pareeth/i }),
    ).not.toBeInTheDocument();
  });
});

// 22 Nov: every page shows the same tabs for the same person, because the header decides them from the viewer.
describe("PortalHeader tabs", () => {
  const tabs = () =>
    screen
      .getAllByRole("link")
      .map((a) => a.textContent?.trim())
      .filter(Boolean);

  it("gives an admin the workspace, inbox and admin tabs", () => {
    render(
      <PortalHeader
        name="Admin Person"
        viewer={{ id: "u1", role: "SUMMIT_ADMIN", memberships: [] }}
      />,
    );
    for (const name of [
      "Home",
      "Pipeline projects",
      "My projects",
      "Submissions",
      "Upload links",
      "Accounts",
      "User guide",
    ]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    // 23 Nov: requests and the room calendar are one section for the Summit team.
    expect(tabs()).toContain("Meeting calendar");
    expect(tabs()).not.toContain("Meeting requests");
    expect(
      screen.getByRole("link", { name: "Meeting calendar" }),
    ).toHaveAttribute("href", "/inbox");
  });

  it("gives a country focal point My projects and the request inbox, but no admin tabs", () => {
    render(
      <PortalHeader
        name="Focal Point"
        viewer={{
          id: "u2",
          role: "COUNTRY",
          memberships: [{ countryId: "c1", role: "FOCAL_POINT" }],
        }}
      />,
    );
    expect(
      screen.getByRole("link", { name: "My projects" }),
    ).toBeInTheDocument();
    expect(
      // 25 Nov: investors sign up by country; countries see the sign-ups.
      screen.getByRole("link", { name: "Meeting sign-ups" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Accounts" }),
    ).not.toBeInTheDocument();
  });

  it("gives an investor My sign-ups and no workspace", () => {
    render(
      <PortalHeader
        name="Investor"
        viewer={{ id: "u3", role: "INVESTOR", memberships: [] }}
      />,
    );
    expect(
      screen.getByRole("link", { name: "My sign-ups" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "My projects" }),
    ).not.toBeInTheDocument();
  });
});
