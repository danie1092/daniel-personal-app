import { describe, test, expect } from "vitest";
import { milestoneProgress, savingStreak, formatManwon } from "./savingsInsights";

describe("milestoneProgress", () => {
  test("아직 첫 마일스톤 전이면 reached null, next 100만", () => {
    expect(milestoneProgress(500_000)).toEqual({
      reached: null,
      next: 1_000_000,
      pctToNext: 0.5,
    });
  });
  test("100만 달성하면 reached 100만, next 300만, 구간 진행률", () => {
    // 200만 = 100만~300만 구간의 절반
    expect(milestoneProgress(2_000_000)).toEqual({
      reached: 1_000_000,
      next: 3_000_000,
      pctToNext: 0.5,
    });
  });
  test("정확히 마일스톤 금액이면 달성 처리", () => {
    const r = milestoneProgress(1_000_000);
    expect(r.reached).toBe(1_000_000);
    expect(r.next).toBe(3_000_000);
    expect(r.pctToNext).toBe(0);
  });
  test("최고 마일스톤 넘으면 next null, 진행률 1", () => {
    expect(milestoneProgress(150_000_000)).toEqual({
      reached: 100_000_000,
      next: null,
      pctToNext: 1,
    });
  });
  test("0원이면 아무것도 없음", () => {
    expect(milestoneProgress(0)).toEqual({
      reached: null,
      next: 1_000_000,
      pctToNext: 0,
    });
  });
});

describe("savingStreak", () => {
  const c = (saved: number) => ({ saved });

  test("연속 저축 사이클 수 (마지막이 현재)", () => {
    expect(savingStreak([c(0), c(100), c(200), c(300)])).toBe(3);
  });
  test("현재 사이클이 아직 0이어도 스트릭 안 깨짐", () => {
    expect(savingStreak([c(100), c(200), c(0)])).toBe(2);
  });
  test("중간에 0 있으면 그 뒤부터만", () => {
    expect(savingStreak([c(100), c(0), c(200), c(300)])).toBe(2);
  });
  test("저축 이력 없으면 0", () => {
    expect(savingStreak([])).toBe(0);
    expect(savingStreak([c(0)])).toBe(0);
    expect(savingStreak([c(0), c(0)])).toBe(0);
  });
  test("첫 달부터 쭉 저축", () => {
    expect(savingStreak([c(100)])).toBe(1);
  });
});

describe("formatManwon", () => {
  test("만원 단위", () => {
    expect(formatManwon(1_000_000)).toBe("100만원");
    expect(formatManwon(10_000_000)).toBe("1,000만원");
  });
  test("억 단위", () => {
    expect(formatManwon(100_000_000)).toBe("1억");
    expect(formatManwon(150_000_000)).toBe("1억 5,000만원");
  });
  test("만원으로 안 떨어지면 원 단위 그대로", () => {
    expect(formatManwon(1_234_567)).toBe("1,234,567원");
  });
});
