import { describe, test, expect } from "vitest";
import { parseAmount, parseDateMMDD } from "./utils";

describe("parseAmount", () => {
  test("13,200원 → 13200", () => {
    expect(parseAmount("13,200원")).toBe(13200);
  });

  test("9,712원 일시불 → 9712", () => {
    expect(parseAmount("9,712원 일시불")).toBe(9712);
  });

  test("숫자 없으면 NaN", () => {
    expect(parseAmount("원")).toBeNaN();
  });
});

describe("parseDateMMDD", () => {
  test("같은 해 결제 (4/7, smsDate 2026-04-07) → 2026-04-07", () => {
    const smsDate = new Date("2026-04-07T15:29:00+09:00");
    expect(parseDateMMDD("4/7", smsDate)).toBe("2026-04-07");
  });

  test("연말 결제 (12/31, smsDate 2027-01-01) → 2026-12-31", () => {
    // SMS는 1월 1일에 도착했지만 결제는 12/31. 메시지 날짜의 월(1) > 결제 월(12) → 전년도
    const smsDate = new Date("2027-01-01T00:30:00+09:00");
    expect(parseDateMMDD("12/31", smsDate)).toBe("2026-12-31");
  });

  test("MM/DD 정규화 (04/06)", () => {
    const smsDate = new Date("2026-04-06T23:15:00+09:00");
    expect(parseDateMMDD("04/06", smsDate)).toBe("2026-04-06");
  });
});
