/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@nld/billing-ui"],
  serverExternalPackages: ["typeorm", "better-sqlite3"],
  serverMinification: false, // TypeORM string refs need class names preserved
  turbopack: {
    resolveAlias: {
      "@nld/billing-ui": "./packages/billing-ui/src/index.ts",
    },
  },
  async rewrites() {
    const sipWebUrl = process.env.SIP_AGENT_WEB_URL || "http://localhost:5173";
    return [
      { source: "/admin/platform", destination: `${sipWebUrl}/admin/platform/` },
      { source: "/admin/platform/:path*", destination: `${sipWebUrl}/admin/platform/:path*` },
    ];
  },
};

module.exports = nextConfig;
