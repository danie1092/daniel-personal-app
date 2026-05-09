import { describe, it, expect } from "vitest";
import {
  computeRoutineAdjustmentNeeded,
  type RoutineItemRow,
  type RoutineCheckRow,
  type DailyLogRow,
} from "./routineAdjustmentNeeded.js";

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

describe("computeRoutineAdjustmentNeeded", () => {
  const now = new Date("2026-05-08T12:00:00+09:00");

  it("returns null with no active items", () => {
    expect(computeRoutineAdjustmentNeeded([], [], [], now)).toBeNull();
  });

  it("fires low_overall_rate when 7-day rate <= 50%", () => {
    const items: RoutineItemRow[] = [
      { id: "i1", name: "A", time_slot: "morning", is_active: true },
      { id: "i2", name: "B", time_slot: "morning", is_active: true },
    ];
    // 14 slots, 0 checked → 0%.
    const r = computeRoutineAdjustmentNeeded(items, [], [], now);
    expect(r?.evidence.case).toBe("low_overall_rate");
    expect(r?.evidence.proposeChange).toBe("remove");
  });

  it("fires high_item_rate when one item 28-day rate >= 90%", () => {
    const items: RoutineItemRow[] = [
      { id: "i1", name: "물 한 잔", time_slot: "morning", is_active: true },
    ];
    // 28 days, 26 checked = 92.8% — 단일 항목이라 7일 평균도 100%이므로 case1 X.
    const checks: RoutineCheckRow[] = [];
    for (let i = 0; i < 26; i++) {
      checks.push({ item_id: "i1", date: daysAgoStr(now, i), checked: true });
    }
    const r = computeRoutineAdjustmentNeeded(items, checks, [], now);
    expect(r?.evidence.case).toBe("high_item_rate");
    expect(r?.evidence.itemName).toBe("물 한 잔");
    expect(r?.evidence.proposeChange).toBe("add");
  });

  it("fires low_condition_streak when avg <= 2 for 3 days", () => {
    const items: RoutineItemRow[] = [
      { id: "i1", name: "X", time_slot: "morning", is_active: true },
    ];
    // 7일 이행률 100%로 case1 우회 (모든 날 checked)
    const checks: RoutineCheckRow[] = [];
    for (let i = 0; i < 7; i++) {
      checks.push({ item_id: "i1", date: daysAgoStr(now, i), checked: true });
    }
    const dailyLogs: DailyLogRow[] = [
      { date: daysAgoStr(now, 2), sleep_score: 2, mood_score: 1, energy_score: 2 },
      { date: daysAgoStr(now, 1), sleep_score: 2, mood_score: 2, energy_score: 1 },
      { date: ymdKst(now), sleep_score: 1, mood_score: 2, energy_score: 2 },
    ];
    const r = computeRoutineAdjustmentNeeded(items, checks, dailyLogs, now);
    expect(r?.evidence.case).toBe("low_condition_streak");
  });

  it("returns null when condition streak breaks", () => {
    const items: RoutineItemRow[] = [
      { id: "i1", name: "X", time_slot: "morning", is_active: true },
    ];
    const checks: RoutineCheckRow[] = [];
    for (let i = 0; i < 7; i++) {
      checks.push({ item_id: "i1", date: daysAgoStr(now, i), checked: true });
    }
    const dailyLogs: DailyLogRow[] = [
      { date: daysAgoStr(now, 2), sleep_score: 4, mood_score: 4, energy_score: 4 },
      { date: daysAgoStr(now, 1), sleep_score: 2, mood_score: 1, energy_score: 1 },
      { date: ymdKst(now), sleep_score: 1, mood_score: 2, energy_score: 2 },
    ];
    expect(computeRoutineAdjustmentNeeded(items, checks, dailyLogs, now)).toBeNull();
  });
});
