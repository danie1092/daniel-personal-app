// next.config.ts
import type { NextConfig } from "next";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // Phase 0: 인증 응답이 SW에 캐시되지 않도록 /api/* 제외
  runtimeCaching: [
    {
      urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith("/api/"),
      handler: "NetworkOnly",
    },
    {
      urlPattern: ({ url }: { url: URL }) =>
        url.origin === self.location.origin && !url.pathname.startsWith("/api/"),
      handler: "NetworkFirst",
      options: {
        cacheName: "app-shell",
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  turbopack: {},
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default withPWA(nextConfig);
