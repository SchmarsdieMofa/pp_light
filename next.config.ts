import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.PP_LIGHT_E2E === "1" ? ".next-e2e" : ".next",
  serverExternalPackages: ["@node-rs/argon2"],
};

export default nextConfig;
