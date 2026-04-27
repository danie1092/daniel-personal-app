import { describe, test, expect } from "vitest";
import { parseHyundai } from "./hyundai";

const SMS_DATE = new Date("2026-04-07T15:30:00+09:00");

describe("parseHyundai", () => {
  test("[Web발신] 형식", () => {
    const text = `[Web발신]
현대카드MM 승인
함*영
9,712원 일시불
04/07 15:29
교보문고
누적 누적금액`;
    expect(parseHyundai(text, SMS_DATE)).toEqual({
      amount: 9712,
      merchant: "교보문고",
      date: "2026-04-07",
      payment_method: "현대카드",
    });
  });

  test("앱 알림 형식 (마지막 줄 = 가맹점)", () => {
    const text = `함다영 님, 현대카드MM 승인
13,200원 일시불, 4/7 14:07
메가엠지씨커피응암이마트점`;
    expect(parseHyundai(text, SMS_DATE)).toEqual({
      amount: 13200,
      merchant: "메가엠지씨커피응암이마트점",
      date: "2026-04-07",
      payment_method: "현대카드",
    });
  });

  test("현대카드 키워드 없으면 null", () => {
    expect(parseHyundai("우리카드 승인 1000원\n4/7 12:00\n스벅", SMS_DATE)).toBeNull();
  });
});
