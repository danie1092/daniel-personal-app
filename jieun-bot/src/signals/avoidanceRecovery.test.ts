import { describe, it, expect } from "vitest";
import { computeAvoidanceRecovery, type RoutineCheckRow } from "./avoidanceRecovery.js";

const today = new Date("2026-05-01T12:00:00+09:00");

describe("computeAvoidanceRecovery", () => {
  it("returns null when no checks today", () => {
    expect(computeAvoidanceRecovery([], today)).toBeNull();
  });

  it("flags when item checked today after 3+ day break", () => {
    const checks: RoutineCheckRow[] = [
      { item_id: "i1", date: "2026-04-26", checked: true },
      { item_id: "i1", date: "2026-05-01", checked: true },
    ];
    const r = computeAvoidanceRecovery(checks, today);
    expect(r).not.toBeNull();
    expect(r?.kind).toBe("avoidance_recovery");
    expect(r?.evidence.itemId).toBe("i1");
    expect(r?.evidence.gapDays).toBe(5);
  });

  it("returns null when checked yesterday too (not avoidance)", () => {
    const checks: RoutineCheckRow[] = [
      { item_id: "i1", date: "2026-04-30", checked: true },
      { item_id: "i1", date: "2026-05-01", checked: true },
    ];
    expect(computeAvoidanceRecovery(checks, today)).toBeNull();
  });
});
