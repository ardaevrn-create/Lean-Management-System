import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@lean/shared"],
  reactStrictMode: true,
};

export default nextConfig;
