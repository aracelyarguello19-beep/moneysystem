import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/domain", "@repo/database"],
  webpack: (config, { dev }) => {
    if (dev) {
      // El cache persistente de webpack en disco se corrompe intermitentemente
      // en dev (ENOENT en .next/cache/webpack/*.pack.gz), tumbando el servidor
      // con 500s. Se desactiva para dev; no afecta el build de producción.
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
