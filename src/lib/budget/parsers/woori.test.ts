import { describe, test, expect } from "vitest";
import { parseWoori } from "./woori";

const SMS_DATE = new Date("2026-04-06T23:20:00+09:00");
const SMS_DATE_JUN = new Date("2026-06-23T20:12:00+09:00");
const SMS_DATE_JUL = new Date("2026-07-12T14:41:00+09:00");

describe("parseWoori", () => {
  test("신 포맷 (실제 문자)", () => {
    const text = `[Web발신]
우리(0157)승인
함*영님
10,980원 일시불
06/23 20:12
쿠팡(쿠페이)
누적728,811원`;
    expect(parseWoori(text, SMS_DATE_JUN)).toEqual({
      amount: 10980,
      merchant: "쿠팡(쿠페이)",
      date: "2026-06-23",
      payment_method: "우리카드",
    });
  });

  test("구 포맷 (기존 유지)", () => {
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

  test("가맹점에 공백 있어도 끝까지 잡는다", () => {
    const text = `[Web발신]
우리(0157)승인
함*영님
5,500원 일시불
06/22 08:10
메가엠지씨커피 응암점
누적100,000원`;
    expect(parseWoori(text, SMS_DATE_JUN)?.merchant).toBe("메가엠지씨커피 응암점");
  });

  test("해외승인 (USD → 고정환율 환산)", () => {
    const text = `[Web발신]
우리(0157)해외승인
함*영님
USD 17.99
07/12 14:41
GOOGLE *Yo`;
    // 17.99 * 1540 = 27,704.6 → 반올림 27,705
    expect(parseWoori(text, SMS_DATE_JUL)).toEqual({
      amount: 27705,
      merchant: "GOOGLE *Yo",
      date: "2026-07-12",
      payment_method: "우리카드",
    });
  });

  test("우리카드 아님 → null", () => {
    expect(parseWoori("현대카드MM 승인\n9,712원\n04/07 15:29\n교보문고", SMS_DATE)).toBeNull();
    expect(parseWoori("하나3*0*체크승인 함*영 9,900원06/23 19:23 넷플릭스", SMS_DATE_JUN)).toBeNull();
  });
});
