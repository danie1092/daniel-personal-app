// 회고 탭 구조:
//   A: 월 (date, format `yyyy년 m월`)
//   B: 예산 (number)
//   C: 잘한 점 (text)
//   D: 반성한 점 (text)
//   E: 주요 이벤트 (text)
//
// 1행은 헤더, 2행부터 월별 row.

export function reflectionHeader(): string[] {
  return ["월", "예산", "잘한 점", "반성한 점", "주요 이벤트"];
}

export type ReflectionRow = [string, number, string, string, string];

// 한 해 12개월 row. A 컬럼은 ISO date string ("2026-01-01"); Sheets에서
// number format으로 "yyyy년 m월" 표시 (포맷은 setupDashboard에서 적용).
export function reflectionRows(year: number, defaultBudget = 0): ReflectionRow[] {
  const out: ReflectionRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = String(m).padStart(2, "0");
    out.push([`${year}-${month}-01`, defaultBudget, "", "", ""]);
  }
  return out;
}
