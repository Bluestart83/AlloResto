/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@nld/iagent-lib"],
  serverExternalPackages: ["typeorm", "better-sqlite3"],
};

module.exports = nextConfig;
