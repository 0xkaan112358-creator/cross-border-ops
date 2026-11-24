import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "unpdf", "mammoth"],
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    resolveAlias: {
      "./identity.dev.js": "./cursor/identity.dev.ts",
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
