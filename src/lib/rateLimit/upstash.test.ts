import { describe, test, expect, vi, beforeEach } from "vitest";

const { dayLimitMock } = vi.hoisted(() => ({
  dayLimitMock: vi.fn(),
}));

vi.mock("@upstash/ratelimit", async () => {
  const real = await vi.importActual<typeof import("@upstash/ratelimit")>("@upstash/ratelimit");
  return {
    ...real,
    Ratelimit: Object.assign(
      vi.fn().mockImplementation(() => ({
        limit: dayLimitMock,
      })),
      { slidingWindow: real.Ratelimit.slidingWindow.bind(real.Ratelimit) }
    ),
  };
});
vi.mock("@upstash/redis", () => ({
  Redis: vi.fn().mockImplementation(() => ({})),
}));

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = "http://x";
  process.env.UPSTASH_REDIS_REST_TOKEN = "t";
  vi.resetModules();
  vi.clearAllMocks();
});

describe("checkBudgetSmsLimit", () => {
  test("env 미설정 시 fail-open", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { checkBudgetSmsLimit } = await import("./upstash");
    const result = await checkBudgetSmsLimit();
    expect(result).toEqual({ ok: true });
  });

  // 모든 limiter가 dayLimitMock을 공유한다. minute/day 두 번 호출되므로 mockResolvedValue로 일관 응답 set.
  test("둘 다 통과하면 ok", async () => {
    dayLimitMock.mockResolvedValue({ success: true, remaining: 29, reset: Date.now() + 60_000 });
    const { checkBudgetSmsLimit } = await import("./upstash");
    const r = await checkBudgetSmsLimit();
    expect(r.ok).toBe(true);
  });

  test("차단 → ok=false + retryAfter", async () => {
    const reset = Date.now() + 2000;
    dayLimitMock.mockResolvedValue({ success: false, remaining: 0, reset });
    const { checkBudgetSmsLimit } = await import("./upstash");
    const r = await checkBudgetSmsLimit();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfter).toBeGreaterThanOrEqual(1);
  });
});
