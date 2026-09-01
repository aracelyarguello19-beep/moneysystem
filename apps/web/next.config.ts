import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/domain", "@repo/database"],
};

export default nextConfig;
