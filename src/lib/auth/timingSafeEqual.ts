import { timingSafeEqual } from "node:crypto";

/**
 * 길이가 다른 입력도 안전하게 처리하는 timing-safe 문자열 비교.
 * Node의 timingSafeEqual은 동일 길이 Buffer만 받기 때문에,
 * 길이가 다르면 즉시 false를 반환한다 (이 경우는 timing leak 의미가 없음).
 */
export function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
