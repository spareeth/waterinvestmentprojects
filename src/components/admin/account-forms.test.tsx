import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The form calls server actions; they are not needed to check what the form shows.
vi.mock("@/app/(portal)/admin/accounts/actions", () => ({
  createAccountAction: vi.fn(),
  resetPasswordAction: vi.fn(),
}));

const { CreateAccountForm } = await import("@/components/admin/account-forms");

function chooseRole(role: string) {
  fireEvent.change(screen.getByLabelText("Role"), { target: { value: role } });
}

describe("Create account form, countries", () => {
  it("lists the countries to tick for a country account", () => {
    render(
      <CreateAccountForm
        roles={["COUNTRY", "INVESTOR"]}
        countries={[
          { id: "c1", name: "Fictionland" },
          { id: "c2", name: "Testonia" },
        ]}
      />,
    );
    chooseRole("COUNTRY");
    expect(
      screen.getByRole("checkbox", { name: "Fictionland" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Testonia" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No countries yet/)).not.toBeInTheDocument();
  });

  it("says where to add countries when there are none, instead of an empty list", () => {
    render(
      <CreateAccountForm roles={["COUNTRY", "INVESTOR"]} countries={[]} />,
    );
    chooseRole("COUNTRY");
    expect(screen.getByText(/No countries yet/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Admin, Countries" }),
    ).toHaveAttribute("href", "/admin/countries");
  });

  it("asks for no country for an investor account", () => {
    render(
      <CreateAccountForm roles={["COUNTRY", "INVESTOR"]} countries={[]} />,
    );
    chooseRole("INVESTOR");
    expect(screen.queryByText(/No countries yet/)).not.toBeInTheDocument();
  });
});
