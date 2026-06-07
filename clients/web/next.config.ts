import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/contracts"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async rewrites() {
    return [
      {
        source: "/requirement/:path*",
        destination: `${process.env.API_ORIGIN ?? "http://localhost:3001"}/requirement/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${process.env.API_ORIGIN ?? "http://localhost:3001"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
