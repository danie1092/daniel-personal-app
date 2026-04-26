import { describe, test, expect } from "vitest";
import { requireBearer } from "./requireBearer";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new Request("https://example.com/api/x", { headers });
}

describe("requireBearer", () => {
  test("Authorization 헤더 없으면 ok=false, 401 반환", async () => {
    const result = requireBearer(makeRequest(), "expected-token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  test("Bearer prefix 없으면 ok=false", () => {
    const result = requireBearer(makeRequest("expected-token"), "expected-token");
    expect(result.ok).toBe(false);
  });

  test("토큰이 다르면 ok=false", () => {
    const result = requireBearer(makeRequest("Bearer wrong-token"), "expected-token");
    expect(result.ok).toBe(false);
  });

  test("토큰이 일치하면 ok=true", () => {
    const result = requireBearer(makeRequest("Bearer expected-token"), "expected-token");
    expect(result.ok).toBe(true);
  });

  test("expected가 빈 문자열이면 항상 ok=false (설정 미스 보호)", () => {
    const result = requireBearer(makeRequest("Bearer "), "");
    expect(result.ok).toBe(false);
  });
});
