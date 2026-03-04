/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@nld/billing-ui"],
  serverExternalPackages: ["typeorm", "better-sqlite3"],
  turbopack: {
    resolveAlias: {
      "@nld/billing-ui": "./packages/billing-ui/src/index.ts",
    },
  },
};

module.exports = nextConfig;
