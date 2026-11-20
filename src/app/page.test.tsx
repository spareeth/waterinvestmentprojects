import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The landing page (M6) reads name, support email, Summit details and partners from config, which reads the
// environment when it is first imported. Each test sets the environment, then imports a fresh copy.
async function renderLanding(env: Record<string, string> = {}) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  const { LandingPage } = await import("@/components/landing/landing-page");
  const { appConfig } = await import("@/lib/config");
  return { ...render(<LandingPage />), appConfig };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Landing page", () => {
  it("shows the platform name from config and the main message", async () => {
    await renderLanding({ APP_NAME: "Fictional Test Portal" });
    expect(screen.getByText("Fictional Test Portal")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /investment-ready water projects/i,
      }),
    ).toBeInTheDocument();
  });

  it("gives the Summit context from config", async () => {
    const { appConfig } = await renderLanding();
    const { summit } = appConfig;
    expect(
      screen.getByText(
        `${summit.name} · ${summit.date} · ${summit.conference}, ${summit.city}`,
      ),
    ).toBeInTheDocument();
  });

  it("offers sign-in and explains how access works", async () => {
    await renderLanding();
    const signInLinks = screen.getAllByRole("link", { name: /sign in/i });
    expect(signInLinks.length).toBeGreaterThan(0);
    for (const link of signInLinks) {
      expect(link).toHaveAttribute("href", "/sign-in");
    }
    expect(
      screen.getByRole("heading", { level: 2, name: "How access works" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/own upload link/)).toBeInTheDocument();
    // PLAN 0a.3: no second step at sign-in for now, so the page must not promise one.
    expect(screen.queryByText(/two-step/i)).not.toBeInTheDocument();
  });

  it("shows the shared support mailbox from config", async () => {
    await renderLanding({ SUPPORT_EMAIL: "support@example.test" });
    const contact = screen.getByRole("region", { name: "Contact" });
    expect(
      within(contact).getByRole("link", { name: /support@example\.test/ }),
    ).toHaveAttribute("href", "mailto:support@example.test");
    // The contact section is enough: no separate Contact link in the top menu.
    expect(
      screen.queryByRole("link", { name: "Contact" }),
    ).not.toBeInTheDocument();
  });

  it("hides the contact section and link when no support mailbox is set", async () => {
    const { container } = await renderLanding({ SUPPORT_EMAIL: "" });
    expect(
      screen.queryByRole("region", { name: "Contact" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Contact" }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("shows the copyright in the footer and Expo City Dubai as a partner placeholder, not a logo", async () => {
    const { container } = await renderLanding();
    const list = screen.getByRole("list", { name: "Partners" });
    expect(within(list).getByText("Expo City Dubai")).toHaveAttribute(
      "data-placeholder",
      "partner-logo",
    );
    expect(within(list).queryByText(/Terra/)).toBeNull();
    expect(within(list).queryByRole("img")).toBeNull();
    const footer = container.querySelector("footer");
    expect(footer).toHaveTextContent("© 2026 Terra, Expo City Dubai");
    expect(container).not.toHaveTextContent(/developed by/i);
  });

  it("lists the partners from config, as placeholders until logos arrive", async () => {
    const { appConfig } = await renderLanding();
    const list = screen.getByRole("list", { name: "Partners" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(appConfig.partners.length);
    for (const partner of appConfig.partners) {
      if (partner.logo) {
        expect(
          within(list).getByRole("img", { name: partner.name }),
        ).toBeInTheDocument();
      } else {
        expect(within(list).getByText(partner.name)).toHaveAttribute(
          "data-placeholder",
          "partner-logo",
        );
      }
    }
  });

  it("has no tiers, no conference logo and no em dashes", async () => {
    const { container } = await renderLanding({
      SUPPORT_EMAIL: "support@example.test",
    });
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/tier/i);
    expect(text).not.toContain("—");
    // PLAN 0.16: no UN Water Conference branding without MoFA approval; the conference is named in text only.
    expect(container.querySelectorAll("img")).toHaveLength(
      container.querySelectorAll('[aria-label="Partners"] img').length,
    );
  });
});
