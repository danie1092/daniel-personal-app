import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfter: number };

const BUDGET_SMS_KEY = "budget-sms:global";

type BudgetWindow = { minute: Ratelimit; day: Ratelimit };
let budgetCached: BudgetWindow | null = null;

function getBudgetWindows(): BudgetWindow | null {
  if (budgetCached !== null) return budgetCached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    budgetCached = null;
    return null;
  }
  const redis = new Redis({ url, token });
  const minute = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, "1 m"), prefix: "budget-sms-m" });
  const day = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(500, "1 d"), prefix: "budget-sms-d" });
  budgetCached = { minute, day };
  return budgetCached;
}

export async function checkBudgetSmsLimit(): Promise<RateLimitResult> {
  const w = getBudgetWindows();
  if (!w) return { ok: true };

  const [m, d] = await Promise.all([w.minute.limit(BUDGET_SMS_KEY), w.day.limit(BUDGET_SMS_KEY)]);
  if (!m.success || !d.success) {
    const reset = Math.max(m.success ? 0 : m.reset, d.success ? 0 : d.reset);
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return { ok: false, retryAfter };
  }
  return { ok: true };
}

const LOGIN_KEY = "login:global";

let loginCached: Ratelimit | null = null;

function getLoginLimiter(): Ratelimit | null {
  if (loginCached !== null) return loginCached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    loginCached = null;
    return null;
  }
  const redis = new Redis({ url, token });
  // 4자리 PIN(1만 조합) 브루트포스 방어: 5분당 10회.
  loginCached = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "5 m"), prefix: "login" });
  return loginCached;
}

export async function checkLoginLimit(): Promise<RateLimitResult> {
  const limiter = getLoginLimiter();
  if (!limiter) return { ok: true };

  const r = await limiter.limit(LOGIN_KEY);
  if (!r.success) {
    const retryAfter = Math.max(1, Math.ceil((r.reset - Date.now()) / 1000));
    return { ok: false, retryAfter };
  }
  return { ok: true };
}
