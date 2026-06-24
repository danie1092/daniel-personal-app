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
      // 불변(content-hash) 정적 자산: 네트워크 확인 없이 캐시 즉시 사용.
      // 파일명에 해시가 박혀 stale 위험이 없으므로 안전하다.
      urlPattern: ({ url }: { url: URL }) =>
        url.origin === self.location.origin && url.pathname.startsWith("/_next/static/"),
      handler: "CacheFirst",
      options: {
        cacheName: "next-static",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // Pretendard 등 외부 폰트 CSS/woff — 거의 안 바뀌므로 캐시 우선.
      urlPattern: ({ url }: { url: URL }) =>
        url.origin === "https://cdn.jsdelivr.net" || url.origin === "https://fonts.gstatic.com",
      handler: "CacheFirst",
      options: {
        cacheName: "external-fonts",
        expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // 그 외 동일 출처(HTML 문서 등 동적 데이터): 네트워크 우선 유지 → 항상 최신.
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
