const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@nld/billing-ui"],
  serverExternalPackages: ["typeorm", "better-sqlite3"],
  turbopack: {
    resolveAlias: {
      "@nld/billing-ui": "./packages/billing-ui/src/index.ts",
    },
  },
  webpack: (config) => {
    config.resolve.alias["@nld/billing-ui"] = path.resolve(
      __dirname,
      "packages/billing-ui/src/index.ts"
    );
    return config;
  },
  async rewrites() {
    const sipWebUrl = process.env.SIP_AGENT_WEB_URL || "http://localhost:5173";
    return [
      {
        source: "/admin/platform",
        destination: `${sipWebUrl}/admin/platform/`,
      },
      {
        source: "/admin/platform/:path*",
        destination: `${sipWebUrl}/admin/platform/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
