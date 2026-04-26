import { safeCompare } from "./timingSafeEqual";

export type RequireBearerResult =
  | { ok: true }
  | { ok: false; response: Response };

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Authorization: Bearer <token> 헤더를 검증한다.
 * - 헤더 없거나 prefix가 다르면 401
 * - 토큰 비교는 timing-safe
 * - expected가 비어있으면(설정 누락) 항상 401
 */
export function requireBearer(
  request: Request,
  expected: string | undefined
): RequireBearerResult {
  if (!expected) {
    return { ok: false, response: unauthorized() };
  }
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return { ok: false, response: unauthorized() };
  }
  const token = header.slice("Bearer ".length);
  if (!safeCompare(token, expected)) {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true };
}
