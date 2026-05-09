import { describe, it, expect } from "vitest";
import {
  computeSurvivalRoutineMiss,
  type RoutineItemRow,
  type RoutineCheckRow,
} from "./survivalRoutineMiss.js";

// 모든 KST 'YYYY-MM-DD' 입력은 buildKst로 — 테스트도 시간대 안전.
function ymdKst(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

describe("computeSurvivalRoutineMiss", () => {
  const now = new Date("2026-05-08T12:00:00+09:00");
  const today = ymdKst(now);
  const yesterday = ymdKst(new Date(now.getTime() - 86400_000));

  it("returns null when no survival items", () => {
    const items: RoutineItemRow[] = [
      { id: "i1", name: "물 한 잔", is_active: true },
    ];
    expect(computeSurvivalRoutineMiss(items, [], now)).toBeNull();
  });

  it("returns null if survival item checked today", () => {
    const items: RoutineItemRow[] = [
      { id: "i1", name: "하루 2끼 먹기", is_active: true },
    ];
    const checks: RoutineCheckRow[] = [
      { item_id: "i1", date: today, checked: true },
    ];
    expect(computeSurvivalRoutineMiss(items, checks, now)).toBeNull();
  });

  it("returns null if checked yesterday only (today still pending)", () => {
    // 오늘 아직 안 한 건 정상 — 어제 체크돼 있으면 2일 연속 미체크 아님.
    const items: RoutineItemRow[] = [
      { id: "i1", name: "집에 오자마자 씻기", is_active: true },
    ];
    const checks: RoutineCheckRow[] = [
      { item_id: "i1", date: yesterday, checked: true },
    ];
    expect(computeSurvivalRoutineMiss(items, checks, now)).toBeNull();
  });

  it("fires when survival item missed both today and yesterday", () => {
    const items: RoutineItemRow[] = [
      { id: "i1", name: "취침 12:30", is_active: true },
    ];
    const r = computeSurvivalRoutineMiss(items, [], now);
    expect(r?.kind).toBe("survival_routine_miss");
    expect(r?.evidence.itemName).toBe("취침 12:30");
  });

  it("ignores inactive survival items", () => {
    const items: RoutineItemRow[] = [
      { id: "i1", name: "하루 2끼 먹기", is_active: false },
    ];
    expect(computeSurvivalRoutineMiss(items, [], now)).toBeNull();
  });
});
