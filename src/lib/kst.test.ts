import { describe, test, expect } from "vitest";
import { toKST } from "./kst";

describe("toKST", () => {
  test("UTC 오전이 KST 저녁으로 — 2026-07-07T10:32Z → 7일 19:32", () => {
    const k = toKST(new Date("2026-07-07T10:32:00Z"));
    expect(k.getFullYear()).toBe(2026);
    expect(k.getMonth()).toBe(6);
    expect(k.getDate()).toBe(7);
    expect(k.getHours()).toBe(19);
    expect(k.getMinutes()).toBe(32);
  });

  test("날짜 경계 — UTC 6일 16:00은 KST 7일 01:00", () => {
    const k = toKST(new Date("2026-07-06T16:00:00Z"));
    expect(k.getDate()).toBe(7);
    expect(k.getHours()).toBe(1);
  });

  test("연 경계 — UTC 12-31 20:00은 KST 1-1 05:00", () => {
    const k = toKST(new Date("2026-12-31T20:00:00Z"));
    expect(k.getFullYear()).toBe(2027);
    expect(k.getMonth()).toBe(0);
    expect(k.getDate()).toBe(1);
  });
});
