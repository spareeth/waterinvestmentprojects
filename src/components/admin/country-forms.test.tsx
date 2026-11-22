import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The form calls server actions; they are not needed to check the country search.
vi.mock("@/app/(portal)/admin/countries/actions", () => ({
  addContactAction: vi.fn(),
  createCountryAction: vi.fn(),
  removeContactAction: vi.fn(),
  setCountryStatusAction: vi.fn(),
  updateContactAction: vi.fn(),
}));
vi.mock("@/app/(portal)/admin/accounts/status-actions", () => ({
  setAccountStatusAction: vi.fn(),
}));

const { CreateCountryForm } = await import("@/components/admin/country-forms");

describe("Add country search", () => {
  it("lists matching countries as you type and fills in the name and ISO code on a pick", () => {
    render(<CreateCountryForm />);
    const name = screen.getByRole("combobox", { name: "Country name" });
    fireEvent.change(name, { target: { value: "sri" } });
    const option = screen.getByRole("option", { name: /Sri Lanka/ });
    fireEvent.mouseDown(option);
    expect(name).toHaveValue("Sri Lanka");
    expect(screen.getByLabelText("ISO code (3 letters)")).toHaveValue("LKA");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("picks the highlighted country with the keyboard", () => {
    render(<CreateCountryForm />);
    const name = screen.getByRole("combobox", { name: "Country name" });
    fireEvent.change(name, { target: { value: "ang" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(name).toHaveValue("Angola");
    expect(screen.getByLabelText("ISO code (3 letters)")).toHaveValue("AGO");
  });

  it("marks countries already added", () => {
    render(<CreateCountryForm existing={["MAR"]} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Country name" }), {
      target: { value: "moro" },
    });
    expect(
      screen.getByRole("option", { name: /Morocco.*already added/ }),
    ).toBeInTheDocument();
  });

  it("still lets a name be typed by hand when it is not in the list", () => {
    render(<CreateCountryForm />);
    const name = screen.getByRole("combobox", { name: "Country name" });
    fireEvent.change(name, { target: { value: "Zzyzxland" } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("ISO code (3 letters)"), {
      target: { value: "zzz" },
    });
    expect(screen.getByLabelText("ISO code (3 letters)")).toHaveValue("ZZZ");
  });
});
