/**
 * 서버 타임존 무관 KST 시각.
 * Vercel(UTC)에서 서버 렌더 시 new Date()의 로컬 getter가 UTC를 돌려줘서
 * 인사말·"오늘"·사이클 경계가 한국 기준 자정~09시에 어제로 밀린다.
 * 이 헬퍼는 로컬 getter(getFullYear/getHours 등)가 KST 값을 돌려주도록 시프트한 Date를 준다.
 * 주의: 시프트된 Date이므로 getTime()/toISOString()은 쓰지 말 것 — 표시·날짜 계산 전용.
 */

const KST_OFFSET_MS = 9 * 3_600_000;

export function toKST(d: Date): Date {
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60_000;
  return new Date(utcMs + KST_OFFSET_MS);
}

export function nowKST(): Date {
  return toKST(new Date());
}
