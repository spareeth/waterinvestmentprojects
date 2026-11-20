// HTTP security headers for every response (M8, PLAN section 5 security baseline). Used by next.config.ts, so
// no imports from the app and no "@/" paths.
//
// - CSP: only our own origin may supply scripts, styles, images, fonts, frames and connections. Next.js renders
//   small inline scripts, so script-src needs 'unsafe-inline' (a nonce would make every page dynamic). The
//   development server also needs 'unsafe-eval', so the policy is only sent by production builds.
// - Teaser files (/files/...) are shown in a same-origin frame by the browser's own PDF viewer. A CSP with
//   object-src 'none' on the PDF response stops Chrome's viewer, so those responses only get frame-ancestors.
// - HSTS only when the site is served over https (APP_URL), so a local http build keeps working.

export interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

export function contentSecurityPolicy({ https }: { https: boolean }): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ];
  if (https) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function securityHeaders({
  production,
  appUrl,
}: {
  production: boolean;
  appUrl: string;
}): HeaderRule[] {
  const https = appUrl.startsWith("https://");
  const common = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (https) {
    common.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000",
    });
  }
  const rules: HeaderRule[] = [{ source: "/:path*", headers: common }];
  if (production) {
    rules.push({
      // Everything except the teaser files.
      source: "/((?!files/).*)",
      headers: [
        {
          key: "Content-Security-Policy",
          value: contentSecurityPolicy({ https }),
        },
      ],
    });
    rules.push({
      source: "/files/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
      ],
    });
  }
  return rules;
}
