import { describe, test, expect, vi } from "vitest";

// dns.lookup 모킹 — 호스트별 가짜 IP를 돌려준다
vi.mock("node:dns", async () => {
  const actual = await vi.importActual<typeof import("node:dns")>("node:dns");
  return {
    ...actual,
    promises: {
      lookup: vi.fn(async (host: string) => {
        const map: Record<string, { address: string; family: 4 | 6 }> = {
          "good.example.com": { address: "93.184.216.34", family: 4 },
          "private.test": { address: "10.0.0.5", family: 4 },
          "loopback.test": { address: "127.0.0.1", family: 4 },
          "linklocal.test": { address: "169.254.169.254", family: 4 },
          "ipv6loop.test": { address: "::1", family: 6 },
        };
        const entry = map[host];
        if (!entry) throw new Error(`unknown host ${host}`);
        return entry;
      }),
    },
  };
});

import { safeFetch } from "./safeFetch";

describe("safeFetch SSRF defense", () => {
  test("http/https 외 스킴 거부", async () => {
    const result = await safeFetch("file:///etc/passwd");
    expect(result.error).toBeDefined();
  });

  test("javascript: URL 거부", async () => {
    const result = await safeFetch("javascript:alert(1)");
    expect(result.error).toBeDefined();
  });

  test("사설 IP(10/8) 호스트 거부", async () => {
    const result = await safeFetch("https://private.test/");
    expect(result.error).toBe("blocked_private_ip");
  });

  test("loopback(127.0.0.1) 호스트 거부", async () => {
    const result = await safeFetch("https://loopback.test/");
    expect(result.error).toBe("blocked_private_ip");
  });

  test("링크로컬(169.254/16) 호스트 거부 — 클라우드 메타데이터 보호", async () => {
    const result = await safeFetch("https://linklocal.test/");
    expect(result.error).toBe("blocked_private_ip");
  });

  test("IPv6 ::1 거부", async () => {
    const result = await safeFetch("https://ipv6loop.test/");
    expect(result.error).toBe("blocked_private_ip");
  });

  test("malformed URL 거부", async () => {
    const result = await safeFetch("not a url");
    expect(result.error).toBeDefined();
  });
});
