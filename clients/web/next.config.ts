import path from "node:path";
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@repo/contracts"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  env: {
    NEXT_PUBLIC_API_BASE_URL: "http://localhost:3001"
  }
};
export default nextConfig;
