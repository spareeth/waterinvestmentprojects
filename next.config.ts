import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not advertise the framework in response headers.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Teaser uploads: the upload link (M0) takes up to 5 files of 25 MB each, at most 60 MB together, plus
      // multipart overhead. The actions and the submission service check both limits themselves.
      bodySizeLimit: "61mb",
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
