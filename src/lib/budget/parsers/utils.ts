/** "13,200원" → 13200, 숫자 없으면 NaN */
export function parseAmount(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 0) return NaN;
  return parseInt(digits, 10);
}

/**
 * "MM/DD" 또는 "M/D" + smsDate(KST) → "YYYY-MM-DD"
 * 결제 월이 SMS 도착 월보다 크면 전년도 결제로 간주 (예: 1월에 12월 결제 통보 도착)
 */
export function parseDateMMDD(mmdd: string, smsDate: Date): string {
  const [m, d] = mmdd.trim().split("/").map((s) => parseInt(s, 10));

  // KST 기준 연/월 계산
  const kst = new Date(smsDate.getTime() + 9 * 60 * 60 * 1000);
  const smsYear = kst.getUTCFullYear();
  const smsMonth = kst.getUTCMonth() + 1;

  const year = m > smsMonth ? smsYear - 1 : smsYear;

  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
