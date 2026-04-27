import { describe, test, expect } from "vitest";
import { parse } from "./index";

const SMS_DATE = new Date("2026-04-07T15:30:00+09:00");

describe("parse", () => {
  test("현대카드 라우팅", () => {
    const text = `함다영 님, 현대카드MM 승인
1,000원 일시불, 4/7 14:00
스타벅스`;
    const result = parse(text, SMS_DATE);
    expect(result?.payment_method).toBe("현대카드");
    expect(result?.merchant).toBe("스타벅스");
  });

  test("우리카드 라우팅", () => {
    const text = `[일시불.승인(0157)]04/07 14:00
2,000원 / 누적:0원
쿠팡`;
    const result = parse(text, SMS_DATE);
    expect(result?.payment_method).toBe("우리카드");
  });

  test("미지원 형식 → null", () => {
    expect(parse("일반 광고문자", SMS_DATE)).toBeNull();
  });
});
