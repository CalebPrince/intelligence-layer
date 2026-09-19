import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ??
      (process.env.NODE_ENV === "production"
        ? "https://intelligence-layer-production-2d12.up.railway.app"
        : "http://localhost:8000");
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
