import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The form calls server actions; they are not needed to check what the form shows.
vi.mock("@/app/(portal)/admin/accounts/actions", () => ({
  createAccountAction: vi.fn(),
  resetPasswordAction: vi.fn(),
}));
vi.mock("@/app/(portal)/admin/accounts/status-actions", () => ({
  removeUserAction: vi.fn(),
}));
const createCountryAction = vi.fn();
vi.mock("@/app/(portal)/admin/countries/actions", () => ({
  createCountryAction: (...args: unknown[]) => createCountryAction(...args),
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
    expect(
      screen.queryByText(/No countries in the portal yet/),
    ).not.toBeInTheDocument();
  });

  it("ticks a country already in the portal when it is picked from the search", () => {
    render(
      <CreateAccountForm
        roles={["COUNTRY"]}
        countries={[{ id: "c1", name: "Kenya", iso3: "KEN" }]}
      />,
    );
    chooseRole("COUNTRY");
    const search = screen.getByRole("combobox", { name: "Another country" });
    fireEvent.change(search, { target: { value: "ken" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: /Kenya/ }));
    expect(screen.getByRole("checkbox", { name: "Kenya" })).toBeChecked();
    expect(createCountryAction).not.toHaveBeenCalled();
  });

  it("adds a country that is not in the portal yet, and ticks it", async () => {
    createCountryAction.mockResolvedValueOnce({
      message: "Ghana added.",
      countryId: "new-gha",
    });
    const { rerender } = render(
      <CreateAccountForm roles={["COUNTRY"]} countries={[]} />,
    );
    chooseRole("COUNTRY");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Another country" }),
      { target: { value: "ghan" } },
    );
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("option", { name: /Ghana/ }));
    });
    const sent = createCountryAction.mock.calls[0][1] as FormData;
    expect(sent.get("name")).toBe("Ghana");
    expect(sent.get("iso3")).toBe("GHA");
    // The server refreshes the page, which brings the new country into the list, already ticked.
    rerender(
      <CreateAccountForm
        roles={["COUNTRY"]}
        countries={[{ id: "new-gha", name: "Ghana", iso3: "GHA" }]}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Ghana" })).toBeChecked();
    expect(
      screen.getByText(/Ghana added to the portal and ticked/),
    ).toBeInTheDocument();
  });

  it("says where to add countries when there are none, instead of an empty list", () => {
    render(
      <CreateAccountForm roles={["COUNTRY", "INVESTOR"]} countries={[]} />,
    );
    chooseRole("COUNTRY");
    expect(
      screen.getByText(/No countries in the portal yet/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Admin, Countries" }),
    ).toHaveAttribute("href", "/admin/countries");
  });

  it("asks for no country for an investor account", () => {
    render(
      <CreateAccountForm roles={["COUNTRY", "INVESTOR"]} countries={[]} />,
    );
    chooseRole("INVESTOR");
    expect(
      screen.queryByText(/No countries in the portal yet/),
    ).not.toBeInTheDocument();
  });
});
