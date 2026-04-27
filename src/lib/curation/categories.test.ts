import { describe, test, expect } from "vitest";
import { CURATION_CATEGORIES, isCurationCategory } from "./categories";

describe("CURATION_CATEGORIES", () => {
  test("8개 카테고리 정의됨", () => {
    expect(CURATION_CATEGORIES).toHaveLength(8);
  });

  test("정해진 라벨 포함", () => {
    expect(CURATION_CATEGORIES).toEqual([
      "음식·카페",
      "여행",
      "패션",
      "운동",
      "인테리어",
      "영감",
      "정보·꿀팁",
      "기타",
    ]);
  });
});

describe("isCurationCategory", () => {
  test("정상 카테고리 → true", () => {
    expect(isCurationCategory("여행")).toBe(true);
  });

  test("미정의 문자열 → false", () => {
    expect(isCurationCategory("랜덤")).toBe(false);
  });

  test("non-string → false", () => {
    expect(isCurationCategory(null)).toBe(false);
    expect(isCurationCategory(undefined)).toBe(false);
    expect(isCurationCategory(123)).toBe(false);
  });
});
