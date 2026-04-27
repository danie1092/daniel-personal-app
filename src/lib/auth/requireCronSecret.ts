import { safeCompare } from "./timingSafeEqual";

export type RequireCronSecretResult =
  | { ok: true }
  | { ok: false; response: Response };

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Authorization: Bearer ${CRON_SECRET}을 timing-safe 검증한다.
 * - env 누락이면 항상 401
 * - Vercel Cron이 자동으로 Authorization 헤더에 secret을 보내도록 설정되어야 함
 */
export function requireCronSecret(request: Request): RequireCronSecretResult {
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: false, response: unauthorized() };

  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return { ok: false, response: unauthorized() };

  const token = header.slice("Bearer ".length);
  if (!safeCompare(token, expected)) return { ok: false, response: unauthorized() };

  return { ok: true };
}
