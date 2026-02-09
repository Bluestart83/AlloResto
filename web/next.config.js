/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["typeorm", "better-sqlite3"],
  },
};

module.exports = nextConfig;
