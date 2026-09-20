import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Default Server Action body limit is 1 MB; uploads allow up to 15 MB.
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
