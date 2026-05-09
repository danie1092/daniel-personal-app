import type { SignalCandidate } from "./types.js";

export type RoutineItemRow = { id: string; name: string; time_slot: string | null; is_active: boolean };
export type RoutineCheckRow = { item_id: string; date: string; checked: boolean };
export type DailyLogRow = {
  date: string;
  sleep_score: number | null;
  mood_score: number | null;
  energy_score: number | null;
};

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

/**
 * 루틴 추가/제거 제안 트리거. latent/weekly에서만 발화 (룰은 prompt가 강제).
 *
 * 발화 조건 — 셋 중 하나라도 만족:
 *  1) 7일 평균 이행률 ≤ 50% → "줄이기" 후보 (직접 어떤 항목 빼라고는 안 함; 다영과 합의)
 *  2) 특정 항목 28일 이행률 ≥ 90% → "더하기" 후보 (안정된 항목, 다음 단계로)
 *  3) 컨디션 점수 평균 ≤ 2점이 3일 연속 → "줄이기" 후보 (지쳤을 때 더 못 잡게)
 *
 * evidence에 case + 구체 수치 박음 → reason 필드에 그대로 박힐 수 있게.
 */
export function computeRoutineAdjustmentNeeded(
  items: RoutineItemRow[],
  checks: RoutineCheckRow[],
  dailyLogs: DailyLogRow[],
  now: Date
): SignalCandidate | null {
  const active = items.filter((i) => i.is_active);
  if (active.length === 0) return null;

  const today = ymdKst(now);
  // 7일: 오늘 포함 7일치
  const last7Set = new Set<string>();
  for (let i = 0; i < 7; i++) last7Set.add(daysAgoStr(now, i));
  const last28Set = new Set<string>();
  for (let i = 0; i < 28; i++) last28Set.add(daysAgoStr(now, i));

  // case 1: 7일 전체 이행률
  let totalSlots = 0;
  let checkedSlots = 0;
  const checkedKey = new Set<string>();
  for (const c of checks) {
    if (c.checked) checkedKey.add(`${c.item_id}_${c.date}`);
  }
  for (const it of active) {
    for (const d of last7Set) {
      totalSlots++;
      if (checkedKey.has(`${it.id}_${d}`)) checkedSlots++;
    }
  }
  const rate7 = totalSlots > 0 ? checkedSlots / totalSlots : 0;
  if (totalSlots > 0 && rate7 <= 0.5) {
    return {
      kind: "routine_adjustment_needed",
      evidence: {
        case: "low_overall_rate",
        rate7: Number(rate7.toFixed(2)),
        proposeChange: "remove",
        reasonText: `루틴 7일 이행률 ${Math.round(rate7 * 100)}%`,
      },
      computed_at: now,
    };
  }

  // case 2: 항목별 28일 이행률 ≥ 90%
  for (const it of active) {
    let total = 0;
    let done = 0;
    for (const d of last28Set) {
      total++;
      if (checkedKey.has(`${it.id}_${d}`)) done++;
    }
    if (total === 0) continue;
    const rate = done / total;
    if (rate >= 0.9) {
      return {
        kind: "routine_adjustment_needed",
        evidence: {
          case: "high_item_rate",
          itemId: it.id,
          itemName: it.name,
          rate28: Number(rate.toFixed(2)),
          proposeChange: "add",
          reasonText: `${it.name} 28일 이행률 ${Math.round(rate * 100)}%`,
        },
        computed_at: now,
      };
    }
  }

  // case 3: 컨디션 평균 점수 ≤ 2가 3일 연속
  const last3 = [daysAgoStr(now, 2), daysAgoStr(now, 1), today];
  const byDate = new Map<string, DailyLogRow>();
  for (const r of dailyLogs) byDate.set(r.date, r);
  let lowStreak = 0;
  for (const d of last3) {
    const r = byDate.get(d);
    if (!r) break;
    const scores = [r.sleep_score, r.mood_score, r.energy_score].filter(
      (v): v is number => typeof v === "number"
    );
    if (scores.length === 0) break;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg <= 2) lowStreak++;
    else break;
  }
  if (lowStreak >= 3) {
    return {
      kind: "routine_adjustment_needed",
      evidence: {
        case: "low_condition_streak",
        days: 3,
        proposeChange: "remove",
        reasonText: "컨디션 평균 2점↓ 3일 연속",
      },
      computed_at: now,
    };
  }

  return null;
}
