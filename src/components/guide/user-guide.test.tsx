import { existsSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The guide reads the name and support mailbox from config, which reads the environment when first imported.
async function renderGuide(env: Record<string, string> = {}) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  const { UserGuide, GUIDE_SECTIONS } = await import("./user-guide");
  return { ...render(<UserGuide />), GUIDE_SECTIONS };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("User guide", () => {
  it("has a section for every role, each listed in the contents", async () => {
    const { GUIDE_SECTIONS } = await renderGuide();
    expect(
      screen.getByRole("heading", { level: 1, name: "User guide" }),
    ).toBeInTheDocument();
    const contents = screen.getByRole("navigation", { name: "Guide contents" });
    for (const section of GUIDE_SECTIONS) {
      expect(
        screen.getByRole("heading", { level: 2, name: section.title }),
      ).toBeInTheDocument();
      expect(
        within(contents).getByRole("link", { name: section.title }),
      ).toHaveAttribute("href", `#${section.id}`);
    }
  });

  it("uses the platform name and the shared support mailbox from config", async () => {
    await renderGuide({
      APP_NAME: "Fictional Test Portal",
      SUPPORT_EMAIL: "support@example.test",
    });
    expect(screen.getAllByText(/Fictional Test Portal/).length).toBeGreaterThan(
      0,
    );
    const mailLinks = screen.getAllByRole("link", {
      name: "support@example.test",
    });
    expect(mailLinks.length).toBeGreaterThan(0);
    expect(mailLinks[0]).toHaveAttribute("href", "mailto:support@example.test");
  });

  it("names the Summit team when no support mailbox is set", async () => {
    const { container } = await renderGuide({ SUPPORT_EMAIL: "" });
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(container.textContent).toMatch(/contact the Summit team/);
  });

  it("states the real upload limits and links to sign-in", async () => {
    const { container } = await renderGuide();
    expect(container.textContent).toContain("up to 5 at a time");
    expect(container.textContent).toContain(
      "up to 25 MB each and 60 MB in total",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  it("has no tiers and no em dashes", async () => {
    const { container } = await renderGuide();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\btier/i);
    expect(text).not.toContain("—");
  });

  it("shows every screenshot once, with alt text, and each file exists", async () => {
    const { container } = await renderGuide();
    const { GUIDE_SCREENSHOTS } = await import("./user-guide");
    const images = [...container.querySelectorAll("figure img")];
    expect(images).toHaveLength(GUIDE_SCREENSHOTS.length);
    for (const name of GUIDE_SCREENSHOTS) {
      const img = images.find((i) =>
        i.getAttribute("src")?.endsWith(`/user-guide/${name}.png`),
      );
      expect(img, name).toBeDefined();
      expect(img!.getAttribute("alt")?.length ?? 0).toBeGreaterThan(10);
      expect(
        existsSync(
          path.join(process.cwd(), "public", "user-guide", `${name}.png`),
        ),
        `public/user-guide/${name}.png`,
      ).toBe(true);
    }
  });
});
