import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { appConfig } from "@/lib/config";
import { PortalHeader } from "./portal-header";

vi.mock("@/app/(account)/actions", () => ({ signOutAction: vi.fn() }));

// Signed-in pages: the name and mark lead to the landing page (part of the portal, still signed in), the
// pipeline is always one click away, and the person's name is set apart from the menu links.
describe("PortalHeader", () => {
  it("links the mark to the landing page and always offers the pipeline", () => {
    render(<PortalHeader name="Test Person" showWorkspace={false} />);
    expect(
      screen.getByRole("link", { name: new RegExp(appConfig.name, "i") }),
    ).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute(
      "href",
      "/pipeline",
    );
  });

  it("shows who is signed in as a badge, not as a menu link", () => {
    render(<PortalHeader name="Sajid Pareeth" showWorkspace={false} />);
    const badge = screen.getByTestId("signed-in-user");
    expect(badge).toHaveTextContent("Signed in as Sajid Pareeth");
    expect(badge).toHaveTextContent("SP");
    expect(
      screen.queryByRole("link", { name: /sajid pareeth/i }),
    ).not.toBeInTheDocument();
  });
});
