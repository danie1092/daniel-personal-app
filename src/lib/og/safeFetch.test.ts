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

// fetch를 stub할 수 있도록 globalThis.fetch 교체
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

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

  test("정상 응답이면 status/body/finalUrl 반환", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("hello world", { status: 200, headers: { "content-length": "11" } })
    );
    const result = await safeFetch("https://good.example.com/");
    expect(result.error).toBeUndefined();
    if (!result.error) {
      expect(result.status).toBe(200);
      expect(result.body).toBe("hello world");
      expect(result.finalUrl).toBe("https://good.example.com/");
    }
  });

  test("public→private 리다이렉트 차단 (SSRF 핵심)", async () => {
    // 첫 hop: public host에서 302 → 사설 IP 호스트로 redirect
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://private.test/secret" },
      })
    );
    const result = await safeFetch("https://good.example.com/");
    expect(result.error).toBe("blocked_private_ip");
  });

  test("IPv6 리터럴 [::1] (대괄호 포함)도 거부", async () => {
    const result = await safeFetch("http://[::1]/");
    expect(result.error).toBe("blocked_private_ip");
  });
});
