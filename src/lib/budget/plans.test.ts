import { describe, test, expect } from "vitest";
import { effectiveVariableTargets, effectiveVariableBudget } from "./plans";
import { BUDGET_TARGETS, VARIABLE_BUDGET } from "@/lib/constants";

describe("effectiveVariableTargets", () => {
  test("오버라이드 없으면 기본값 그대로", () => {
    expect(effectiveVariableTargets([])).toEqual(BUDGET_TARGETS);
    expect(effectiveVariableBudget([])).toBe(VARIABLE_BUDGET);
  });

  test("기본 카테고리 오버라이드 반영", () => {
    const t = effectiveVariableTargets([{ category: "온라인쇼핑", amount: 300_000 }]);
    expect(t.온라인쇼핑).toBe(300_000);
    expect(effectiveVariableBudget([{ category: "온라인쇼핑", amount: 300_000 }])).toBe(
      VARIABLE_BUDGET - 100_000
    );
  });

  test("특별예산(기본에 없는 이름)은 새 줄로 추가", () => {
    const overrides = [{ category: "부모님 생신", amount: 200_000 }];
    const t = effectiveVariableTargets(overrides);
    expect(t["부모님 생신"]).toBe(200_000);
    expect(effectiveVariableBudget(overrides)).toBe(VARIABLE_BUDGET + 200_000);
  });

  test("정규 커스텀 카테고리는 기본값처럼 합산", () => {
    const t = effectiveVariableTargets([], { 식료품: 200_000 });
    expect(t.식료품).toBe(200_000);
    expect(effectiveVariableBudget([], { 식료품: 200_000 })).toBe(VARIABLE_BUDGET + 200_000);
  });

  test("커스텀 카테고리 위에 그 달 오버라이드가 이긴다", () => {
    const t = effectiveVariableTargets([{ category: "식료품", amount: 150_000 }], { 식료품: 200_000 });
    expect(t.식료품).toBe(150_000);
  });

  test("고정비 키는 무시 (고정비 탭이 단일 소스)", () => {
    const t = effectiveVariableTargets([{ category: "고정비", amount: 999 }]);
    expect(t.고정비).toBeUndefined();
  });
});
