import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home page", () => {
  it("shows the portal title and invitation-only notice", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Secure Project Portal" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/invitation only/i)).toBeInTheDocument();
  });
});
