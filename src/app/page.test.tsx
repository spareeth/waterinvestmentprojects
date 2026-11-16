import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { appConfig } from "@/lib/config";
import Home from "./page";

describe("Landing page", () => {
  it("shows the platform name from config and the main message", () => {
    render(<Home />);
    expect(screen.getByText(appConfig.name)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /investment-ready water projects/i,
      }),
    ).toBeInTheDocument();
  });

  it("offers sign-in and explains how access works", () => {
    render(<Home />);
    const signInLinks = screen.getAllByRole("link", { name: /sign in/i });
    expect(signInLinks.length).toBeGreaterThan(0);
    for (const link of signInLinks) {
      expect(link).toHaveAttribute("href", "/sign-in");
    }
    expect(screen.getByText("Personal, verified access")).toBeInTheDocument();
  });

  it("does not use em dashes in visible copy", () => {
    const { container } = render(<Home />);
    expect(container.textContent).not.toContain("—");
  });
});
