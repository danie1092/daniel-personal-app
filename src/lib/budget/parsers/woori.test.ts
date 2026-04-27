import { describe, test, expect } from "vitest";
import { parseWoori } from "./woori";

const SMS_DATE = new Date("2026-04-06T23:20:00+09:00");

describe("parseWoori", () => {
  test("일시불 승인", () => {
    const text = `[일시불.승인(0157)]04/06 23:15
5,080원 / 누적:1,493,167원
쿠팡(쿠페이)`;
    expect(parseWoori(text, SMS_DATE)).toEqual({
      amount: 5080,
      merchant: "쿠팡(쿠페이)",
      date: "2026-04-06",
      payment_method: "우리카드",
    });
  });

  test("우리카드/일시불.승인 키워드 없으면 null", () => {
    expect(parseWoori("현대카드MM 승인\n9,712원\n04/07 15:29\n교보문고", SMS_DATE)).toBeNull();
  });
});
