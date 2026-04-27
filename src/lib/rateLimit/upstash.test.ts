import { describe, test, expect, vi, beforeEach } from "vitest";

const { hourLimitMock, dayLimitMock } = vi.hoisted(() => ({
  hourLimitMock: vi.fn(),
  dayLimitMock: vi.fn(),
}));

vi.mock("@upstash/ratelimit", async () => {
  const real = await vi.importActual<typeof import("@upstash/ratelimit")>("@upstash/ratelimit");
  return {
    ...real,
    Ratelimit: Object.assign(
      vi.fn().mockImplementation((opts: { prefix?: string }) => ({
        limit: opts.prefix === "collect-h" ? hourLimitMock : dayLimitMock,
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

describe("checkCollectLimit", () => {
  test("둘 다 통과하면 ok", async () => {
    hourLimitMock.mockResolvedValue({ success: true, remaining: 59, reset: Date.now() + 3600_000 });
    dayLimitMock.mockResolvedValue({ success: true, remaining: 199, reset: Date.now() + 86400_000 });
    const { checkCollectLimit } = await import("./upstash");
    const r = await checkCollectLimit();
    expect(r.ok).toBe(true);
  });

  test("시간당 차단 → ok=false + retryAfter", async () => {
    const reset = Date.now() + 1500;
    hourLimitMock.mockResolvedValue({ success: false, remaining: 0, reset });
    dayLimitMock.mockResolvedValue({ success: true, remaining: 100, reset: Date.now() + 86400_000 });
    const { checkCollectLimit } = await import("./upstash");
    const r = await checkCollectLimit();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfter).toBeGreaterThanOrEqual(1);
  });

  test("일일 차단 → ok=false", async () => {
    hourLimitMock.mockResolvedValue({ success: true, remaining: 50, reset: Date.now() + 3600_000 });
    dayLimitMock.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 5000 });
    const { checkCollectLimit } = await import("./upstash");
    const r = await checkCollectLimit();
    expect(r.ok).toBe(false);
  });

  test("env 미설정 → ok=true (rate limit 없는 환경 fail-open)", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    const { checkCollectLimit } = await import("./upstash");
    const r = await checkCollectLimit();
    expect(r.ok).toBe(true);
  });
});

describe("checkBudgetSmsLimit", () => {
  test("env 미설정 시 fail-open", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { checkBudgetSmsLimit } = await import("./upstash");
    const result = await checkBudgetSmsLimit();
    expect(result).toEqual({ ok: true });
  });

  // mock의 prefix 분기는 collect-h만 hourLimitMock, 그 외(budget-sms-m/d 포함)는 dayLimitMock 사용.
  // 같은 mock이 minute/day 두 번 호출되므로 mockResolvedValue로 일관 응답 set.
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
