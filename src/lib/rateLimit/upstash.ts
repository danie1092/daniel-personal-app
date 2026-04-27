import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const KEY = "collect:global";

type Window = { hour: Ratelimit; day: Ratelimit };
let cached: Window | null = null;

function getWindows(): Window | null {
  if (cached !== null) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cached = null;
    return null;
  }
  const redis = new Redis({ url, token });
  const hour = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "1 h"), prefix: "collect-h" });
  const day = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(200, "1 d"), prefix: "collect-d" });
  cached = { hour, day };
  return cached;
}

export type CollectLimitResult =
  | { ok: true }
  | { ok: false; retryAfter: number };

/**
 * collect:global 키에 대해 hourly + daily sliding window 둘 다 검사.
 * 둘 중 하나라도 차단되면 차단. env 미설정이면 fail-open(개발 편의).
 */
export async function checkCollectLimit(): Promise<CollectLimitResult> {
  const w = getWindows();
  if (!w) return { ok: true };

  const [h, d] = await Promise.all([w.hour.limit(KEY), w.day.limit(KEY)]);
  if (!h.success || !d.success) {
    const reset = Math.max(h.success ? 0 : h.reset, d.success ? 0 : d.reset);
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return { ok: false, retryAfter };
  }
  return { ok: true };
}
