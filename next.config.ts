import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not advertise the framework in response headers.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Teaser uploads (PLAN F3): 25 MB PDF plus multipart overhead. The upload action checks 25 MB itself.
      bodySizeLimit: "26mb",
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
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
