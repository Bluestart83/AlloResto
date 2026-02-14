/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@nld/billing-ui"],
  experimental: {
    serverComponentsExternalPackages: ["typeorm", "better-sqlite3"],
  },
  async rewrites() {
    const sipWebUrl = process.env.SIP_AGENT_WEB_URL || "http://localhost:5173";
    return [
      // SPA sip-agent-server servie sous /admin/platform/*
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
