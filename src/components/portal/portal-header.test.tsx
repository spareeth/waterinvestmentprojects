import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { appConfig } from "@/lib/config";
import { PortalHeader } from "./portal-header";

vi.mock("@/app/(account)/actions", () => ({ signOutAction: vi.fn() }));

// Signed-in pages: the name and mark lead to the portal home, not to the public landing page (which looked like
// being signed out), and the pipeline is always one click away.
describe("PortalHeader", () => {
  it("links the name and mark to the portal home and offers the pipeline", () => {
    render(<PortalHeader name="Test Person" showWorkspace={false} />);
    expect(
      screen.getByRole("link", { name: new RegExp(appConfig.name, "i") }),
    ).toHaveAttribute("href", "/home");
    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute(
      "href",
      "/pipeline",
    );
  });
});
