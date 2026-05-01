import { describe, it, expect } from "vitest";
import { computeRoutineStreak, type RoutineCheckRow, type RoutineItemRow } from "./routineStreak.js";

const today = new Date("2026-05-01T12:00:00+09:00");

describe("computeRoutineStreak", () => {
  it("returns null when no items", () => {
    expect(computeRoutineStreak([], [], today)).toBeNull();
  });

  it("returns null when all items have recent checks", () => {
    const items: RoutineItemRow[] = [{ id: "i1", name: "운동", emoji: "🏃" }];
    const checks: RoutineCheckRow[] = [
      { item_id: "i1", date: "2026-04-30", checked: true },
      { item_id: "i1", date: "2026-04-29", checked: true },
    ];
    expect(computeRoutineStreak(items, checks, today)).toBeNull();
  });

  it("flags 5+ day break", () => {
    const items: RoutineItemRow[] = [{ id: "i1", name: "운동", emoji: "🏃" }];
    const checks: RoutineCheckRow[] = [
      { item_id: "i1", date: "2026-04-25", checked: true },
    ];
    const r = computeRoutineStreak(items, checks, today);
    expect(r).not.toBeNull();
    expect(r?.kind).toBe("routine_streak_break");
    expect(r?.evidence.itemName).toBe("운동");
    expect(r?.evidence.daysSinceCheck).toBe(6);
  });

  it("picks the longest break when multiple items qualify", () => {
    const items: RoutineItemRow[] = [
      { id: "i1", name: "운동", emoji: "🏃" },
      { id: "i2", name: "독서", emoji: "📚" },
    ];
    const checks: RoutineCheckRow[] = [
      { item_id: "i1", date: "2026-04-25", checked: true },
      { item_id: "i2", date: "2026-04-22", checked: true },
    ];
    const r = computeRoutineStreak(items, checks, today);
    expect(r?.evidence.itemName).toBe("독서");
    expect(r?.evidence.daysSinceCheck).toBe(9);
  });

  it("skips break > 14 days (포기로 간주, actionable X)", () => {
    const items: RoutineItemRow[] = [{ id: "i1", name: "햇빛 10분", emoji: "☀️" }];
    // 21일 전에 마지막 체크 — 너무 오래됨
    const checks: RoutineCheckRow[] = [
      { item_id: "i1", date: "2026-04-10", checked: true },
    ];
    expect(computeRoutineStreak(items, checks, today)).toBeNull();
  });

  it("prefers 5-14 day break over 14+ break when both exist", () => {
    const items: RoutineItemRow[] = [
      { id: "i1", name: "햇빛 10분", emoji: "☀️" },  // 21일 전 (skip)
      { id: "i2", name: "운동", emoji: "🏃" },        // 7일 전 (in range)
    ];
    const checks: RoutineCheckRow[] = [
      { item_id: "i1", date: "2026-04-10", checked: true },
      { item_id: "i2", date: "2026-04-24", checked: true },
    ];
    const r = computeRoutineStreak(items, checks, today);
    expect(r?.evidence.itemName).toBe("운동");
    expect(r?.evidence.daysSinceCheck).toBe(7);
  });
});
