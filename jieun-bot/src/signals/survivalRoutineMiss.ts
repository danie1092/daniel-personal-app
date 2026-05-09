import type { SignalCandidate } from "./types.js";

// 생존 루틴 = 이름에 키워드 포함되는 항목.
// 데이터에서 "category=생존" 같은 정식 컬럼이 없어 휴리스틱.
// 노션 UI에 별도 분류 컬럼 추가하면 그쪽으로 옮길 것.
const SURVIVAL_KEYWORDS = ["2끼", "씻", "취침", "수면"];

export type RoutineItemRow = { id: string; name: string; is_active: boolean };
export type RoutineCheckRow = { item_id: string; date: string; checked: boolean };

function ymdKst(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function daysAgoStr(now: Date, n: number): string {
  return ymdKst(new Date(now.getTime() - n * 86400_000));
}

function isSurvival(name: string): boolean {
  return SURVIVAL_KEYWORDS.some((kw) => name.includes(kw));
}

/**
 * 생존 루틴(2끼/씻기/취침) 중 하나라도 *오늘과 어제* 모두 미체크면 발화.
 *  - "미체크" = checked=true 행 부재 (false거나 row 자체 없음)
 *  - 시그널 emit 후 행동 룰: contextSection에 [주의] 박고 지은이는 루틴 얘기 X.
 */
export function computeSurvivalRoutineMiss(
  items: RoutineItemRow[],
  checks: RoutineCheckRow[],
  now: Date
): SignalCandidate | null {
  const today = ymdKst(now);
  const yesterday = daysAgoStr(now, 1);

  const survivors = items.filter((it) => it.is_active && isSurvival(it.name));
  if (survivors.length === 0) return null;

  // (item_id, date) → checked 여부
  const checkedMap = new Map<string, boolean>();
  for (const c of checks) {
    if (c.checked) checkedMap.set(`${c.item_id}_${c.date}`, true);
  }

  for (const it of survivors) {
    const todayChecked = checkedMap.get(`${it.id}_${today}`) === true;
    const yesterdayChecked = checkedMap.get(`${it.id}_${yesterday}`) === true;
    if (!todayChecked && !yesterdayChecked) {
      return {
        kind: "survival_routine_miss",
        evidence: {
          itemId: it.id,
          itemName: it.name,
          missDates: [yesterday, today],
        },
        computed_at: now,
      };
    }
  }
  return null;
}
