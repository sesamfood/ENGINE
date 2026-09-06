import path from "node:path";
import type { NextConfig } from "next";

const repositoryRoot = path.resolve(".");
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const buildId =
  process.env.VERCEL_DEPLOYMENT_ID ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  "development";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      {
        source: "/settings",
        destination: "/administration",
        permanent: false,
      },
      {
        source: "/organization/:path*",
        destination: "/administration/:path*",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  images: {
    remotePatterns: convexUrl
      ? [new URL("/api/storage/**", convexUrl)]
      : [],
  },
  outputFileTracingRoot: repositoryRoot,
  turbopack: {
    root: repositoryRoot,
  },
};

export default nextConfig;
