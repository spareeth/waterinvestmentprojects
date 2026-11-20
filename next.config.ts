import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // Do not advertise the framework in response headers.
  poweredByHeader: false,
  // M8: a self-contained server (.next/standalone) for the production container (Dockerfile).
  output: "standalone",
  experimental: {
    serverActions: {
      // Teaser uploads: the upload link (M0) takes up to 5 files of 25 MB each, at most 60 MB together, plus
      // multipart overhead. The actions and the submission service check both limits themselves. The reverse
      // proxy in front must allow bodies of this size too (docs/DEPLOYMENT.md).
      bodySizeLimit: "61mb",
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
  // M8 security baseline. Baked in at build time: APP_URL is a build argument of the production image.
  async headers() {
    return securityHeaders({
      production: process.env.NODE_ENV === "production",
      appUrl: process.env.APP_URL || "http://localhost:3000",
    });
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
