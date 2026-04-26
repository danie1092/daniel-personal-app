import { describe, test, expect } from "vitest";
import { safeCompare } from "./timingSafeEqual";

describe("safeCompare", () => {
  test("같은 문자열은 true", () => {
    expect(safeCompare("hello", "hello")).toBe(true);
  });

  test("다른 문자열은 false", () => {
    expect(safeCompare("hello", "world")).toBe(false);
  });

  test("길이가 다르면 false (timingSafeEqual은 동일 길이 요구)", () => {
    expect(safeCompare("short", "muchlongertoken")).toBe(false);
  });

  test("빈 문자열끼리는 true", () => {
    expect(safeCompare("", "")).toBe(true);
  });

  test("한쪽만 빈 문자열은 false", () => {
    expect(safeCompare("", "x")).toBe(false);
  });

  test("유니코드 문자열도 정상 비교", () => {
    expect(safeCompare("토큰값", "토큰값")).toBe(true);
    expect(safeCompare("토큰값", "토큰X")).toBe(false);
  });
});
