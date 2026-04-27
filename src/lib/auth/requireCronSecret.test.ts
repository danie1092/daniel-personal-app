import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { requireCronSecret } from "./requireCronSecret";

const ORIG = process.env.CRON_SECRET;

describe("requireCronSecret", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "secret-abc-123";
  });
  afterEach(() => {
    process.env.CRON_SECRET = ORIG;
  });

  test("정상 Bearer → ok", () => {
    const req = new Request("http://x", {
      headers: { authorization: "Bearer secret-abc-123" },
    });
    const r = requireCronSecret(req);
    expect(r.ok).toBe(true);
  });

  test("Authorization 헤더 없음 → 401", () => {
    const req = new Request("http://x");
    const r = requireCronSecret(req);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  test("토큰 불일치 → 401", () => {
    const req = new Request("http://x", {
      headers: { authorization: "Bearer wrong" },
    });
    const r = requireCronSecret(req);
    expect(r.ok).toBe(false);
  });

  test("env 미설정 → 401", () => {
    delete process.env.CRON_SECRET;
    const req = new Request("http://x", {
      headers: { authorization: "Bearer secret-abc-123" },
    });
    const r = requireCronSecret(req);
    expect(r.ok).toBe(false);
  });
});
