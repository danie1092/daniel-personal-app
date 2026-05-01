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
});
