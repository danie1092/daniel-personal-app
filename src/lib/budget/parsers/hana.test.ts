import { describe, test, expect } from "vitest";
import { parseHana } from "./hana";

const SMS_DATE = new Date("2026-06-23T19:23:00+09:00");

describe("parseHana", () => {
  test("체크 승인 (실제 문자)", () => {
    const text = `[Web발신]
하나3*0*체크승인 함*영 22,750원06/23 19:23 쿠팡(쿠페이)`;
    expect(parseHana(text, SMS_DATE)).toEqual({
      amount: 22750,
      merchant: "쿠팡(쿠페이)",
      date: "2026-06-23",
      payment_method: "하나(체크)",
    });
  });

  test("신용 승인", () => {
    const text = `[Web발신]
하나7*1*신용승인 함*영 12,000원06/23 19:23 스타벅스`;
    expect(parseHana(text, SMS_DATE)).toEqual({
      amount: 12000,
      merchant: "스타벅스",
      date: "2026-06-23",
      payment_method: "하나(신용)",
    });
  });

  test("간편결제(종류 미표기) — 앞자리 7*1* → 신용, 일시불/누적 꼬리 제거", () => {
    const text = `[Web발신]
하나7*1*승인 함*영 35,570원 일시불 07/01 23:53 쿠팡(쿠페이) 누적6,957,283원`;
    expect(parseHana(text, new Date("2026-07-02T00:00:00+09:00"))).toEqual({
      amount: 35570,
      merchant: "쿠팡(쿠페이)",
      date: "2026-07-01",
      payment_method: "하나(신용)",
    });
  });

  test("간편결제(종류 미표기) — 앞자리 3*0* → 체크", () => {
    const text = `[Web발신]
하나3*0*승인 함*영 4,500원 일시불 07/01 12:00 메가엠지씨커피`;
    expect(parseHana(text, new Date("2026-07-02T00:00:00+09:00"))?.payment_method).toBe("하나(체크)");
  });

  test("가맹점 이름에 공백/괄호 있어도 끝까지 가져온다", () => {
    const text = `[Web발신]
하나3*0*체크승인 함*영 5,500원06/22 08:10 메가엠지씨커피 응암점`;
    expect(parseHana(text, SMS_DATE)?.merchant).toBe("메가엠지씨커피 응암점");
  });

  test("전월 결제가 다음달에 통보되면 연도 보정", () => {
    const jan = new Date("2027-01-03T10:00:00+09:00");
    expect(parseHana("하나3*0*체크승인 함*영 9,900원12/28 23:50 넷플릭스", jan)?.date).toBe(
      "2026-12-28"
    );
  });

  test("하나카드 아님 → null", () => {
    expect(parseHana("[일시불.승인(0157)]04/06 23:15\n5,080원\n쿠팡", SMS_DATE)).toBeNull();
  });
});
