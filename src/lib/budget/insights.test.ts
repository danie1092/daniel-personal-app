import { describe, test, expect } from "vitest";
import { paceComment, projectEndOfCycle, noSpendStats } from "./insights";

describe("paceComment", () => {
  test("지출 0이면 무지출 챌린지", () => {
    expect(paceComment(0, 1_278_000, 0.5)).toBe("무지출 챌린지!");
  });
  test("예산 초과면 페이스 무관하게 초과 메시지 (탓하지 않고 앞으로를 응원)", () => {
    expect(paceComment(1_300_000, 1_278_000, 0.99)).toBe("예산은 넘었지만, 지금부터 아끼는 게 진짜 실력");
  });
  test("페이스보다 한참 앞서면(+15%p) 강한 브레이크", () => {
    // 진행 50%인데 70% 씀
    expect(paceComment(700_000, 1_000_000, 0.5)).toBe("페이스가 꽤 빨라, 이번 주는 쉬어가자");
  });
  test("페이스보다 조금 앞서면(+5~15%p) 부드러운 주의", () => {
    expect(paceComment(580_000, 1_000_000, 0.5)).toBe("조금 빠른 페이스, 금방 따라잡을 수 있어");
  });
  test("페이스대로면(±5%p) 유지 응원", () => {
    expect(paceComment(500_000, 1_000_000, 0.5)).toBe("페이스 딱 좋아, 이대로만 가자");
  });
  test("페이스보다 아끼는 중이면 칭찬 — 월말에 80% 썼어도 잔소리 X", () => {
    expect(paceComment(800_000, 1_000_000, 0.9)).toBe("페이스보다 아끼는 중, 잘하고 있어 👏");
  });
});

describe("projectEndOfCycle", () => {
  test("현재 일평균 × 사이클 일수, 1000원 단위 반올림", () => {
    // 10일간 40만원 → 일평균 4만 × 30일 = 120만
    expect(projectEndOfCycle(400_000, 10, 30)).toBe(1_200_000);
    // 3일간 100,000 → 33,333.3/일 × 30 = 999,999.9 → 1,000,000
    expect(projectEndOfCycle(100_000, 3, 30)).toBe(1_000_000);
  });
  test("daysInto 0이면 그대로", () => {
    expect(projectEndOfCycle(50_000, 0, 30)).toBe(50_000);
  });
});

describe("noSpendStats", () => {
  test("무지출 일수 + 오늘부터 역방향 연속 스트릭", () => {
    // 6/1~6/10, 지출일: 1,2,5,8 → 무지출 6일 (3,4,6,7,9,10), 스트릭 9~10 = 2일
    const dates = ["2026-06-01", "2026-06-02", "2026-06-05", "2026-06-08"];
    expect(noSpendStats(dates, "2026-06-01", "2026-06-10")).toEqual({ count: 6, streak: 2 });
  });
  test("오늘 지출 있으면 스트릭 0", () => {
    const dates = ["2026-06-10"];
    expect(noSpendStats(dates, "2026-06-01", "2026-06-10")).toEqual({ count: 9, streak: 0 });
  });
  test("전부 무지출이면 count = streak = 전체 일수", () => {
    expect(noSpendStats([], "2026-06-01", "2026-06-03")).toEqual({ count: 3, streak: 3 });
  });
  test("월 경계 넘는 스트릭 (사이클 리셋일 ≠ 1 대비)", () => {
    // 5/28~6/2, 지출일 5/29 → 스트릭 5/30~6/2 = 4일
    expect(noSpendStats(["2026-05-29"], "2026-05-28", "2026-06-02")).toEqual({ count: 5, streak: 4 });
  });
});
