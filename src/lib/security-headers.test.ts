import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";

function headerNames(rules: ReturnType<typeof securityHeaders>) {
  return rules.flatMap((rule) => rule.headers.map((h) => h.key));
}

describe("security headers", () => {
  it("always sends the basic protections", () => {
    const rules = securityHeaders({
      production: false,
      appUrl: "http://localhost:3000",
    });
    const names = headerNames(rules);
    expect(names).toEqual(
      expect.arrayContaining([
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
      ]),
    );
    // No CSP for the development server, no HSTS over http.
    expect(names).not.toContain("Content-Security-Policy");
    expect(names).not.toContain("Strict-Transport-Security");
  });

  it("adds HSTS and a CSP in production over https", () => {
    const rules = securityHeaders({
      production: true,
      appUrl: "https://waterinvestmentprojects.org",
    });
    expect(headerNames(rules)).toContain("Strict-Transport-Security");
    const pages = rules.find((r) => r.source === "/((?!files/).*)");
    const csp = pages?.headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).toContain("default-src 'self'");
    expect(csp?.value).toContain("object-src 'none'");
    expect(csp?.value).toContain("upgrade-insecure-requests");
  });

  it("keeps teaser files viewable in the browser's PDF viewer", () => {
    const rules = securityHeaders({
      production: true,
      appUrl: "https://waterinvestmentprojects.org",
    });
    const files = rules.find((r) => r.source === "/files/:path*");
    expect(files?.headers).toEqual([
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
    ]);
  });

  it("only allows our own origin", () => {
    const csp = contentSecurityPolicy({ https: false });
    expect(csp).not.toMatch(/https?:\/\//);
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
