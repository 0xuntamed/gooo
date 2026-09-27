import type { NextConfig } from "next";

// Static export: the whole site is prerendered to ./out and needs no server.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
