/**
 * 자정~07:59 KST 하드 침묵 윈도우.
 * 시간 트리거 + 잠재 관찰 + 이벤트 트리거에 적용.
 * 사용자 메시지(user 트리거)는 항상 살아있음 — 다영이 새벽에 보내면 답함.
 */
export function isInSilenceWindow(now: Date = new Date()): boolean {
  // KST 시각의 시(hour) 추출
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hour12: false,
  });
  const hourStr = formatter.format(now); // "00".."23"
  const hour = parseInt(hourStr, 10);
  return hour < 8;
}
