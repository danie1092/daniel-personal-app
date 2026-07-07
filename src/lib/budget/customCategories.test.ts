import { describe, test, expect } from "vitest";
import { customTargetsFor, type CustomCategory } from "./customCategories";

const CUSTOMS: CustomCategory[] = [
  { name: "식료품", amount: 200_000, effective_from: "2026-08" },
  { name: "반려식물", amount: 30_000, effective_from: "2026-10" },
];

describe("customTargetsFor", () => {
  test("effective_from 이후 사이클에만 포함", () => {
    expect(customTargetsFor(CUSTOMS, "2026-07")).toEqual({});
    expect(customTargetsFor(CUSTOMS, "2026-08")).toEqual({ 식료품: 200_000 });
    expect(customTargetsFor(CUSTOMS, "2026-10")).toEqual({ 식료품: 200_000, 반려식물: 30_000 });
  });

  test("연 롤오버 — 문자열 비교로 안전", () => {
    expect(customTargetsFor(CUSTOMS, "2027-01")).toEqual({ 식료품: 200_000, 반려식물: 30_000 });
  });

  test("빈 목록이면 빈 맵", () => {
    expect(customTargetsFor([], "2026-08")).toEqual({});
  });
});
