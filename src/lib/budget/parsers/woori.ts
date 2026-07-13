import type { ParseFn } from "./types";
import { parseAmount, parseDateMMDD, parseUsdToKrw } from "./utils";

/**
 * 우리카드 SMS. 두 포맷 지원:
 *  (신) 우리(0157)승인 / 함*영님 / 10,980원 일시불 / 06/23 20:12 / 쿠팡(쿠페이) / 누적728,811원
 *  (구) [일시불.승인(0157)]04/06 23:15 / 5,080원 / 누적:1,493,167원 / 쿠팡(쿠페이)
 *  (해외) 우리(0157)해외승인 / 함*영님 / USD 17.99 / 07/12 14:41 / GOOGLE *Yo  → 고정환율 환산
 *
 * 금액은 첫 '…원'(누적보다 앞). 가맹점은 승인·이름·금액·날짜·누적·머리말 줄을 제외한 나머지 줄.
 */
export const parseWoori: ParseFn = (text, smsDate) => {
  const isWoori =
    /우리\(\d+\)\s*(?:해외)?승인/.test(text) ||
    text.includes("일시불.승인") ||
    text.includes("우리카드");
  if (!isWoori) return null;

  const amountMatch = text.match(/([\d,]+)\s*원/);
  const usdKrw = amountMatch ? null : parseUsdToKrw(text); // 해외승인(USD) → 고정환율 환산
  const dateMatch = text.match(/(\d{1,2}\/\d{1,2})\s+\d{1,2}:\d{2}/);
  if ((!amountMatch && usdKrw == null) || !dateMatch) return null;

  const merchant = text
    .split("\n")
    .map((l) => l.trim())
    .find(
      (l) =>
        !!l &&
        !l.includes("[Web발신]") &&
        !/승인/.test(l) &&
        !/님\s*$/.test(l) &&
        !/[\d,]+\s*원/.test(l) &&
        !/USD\s*[\d,.]+/i.test(l) && // 해외승인 달러 금액 줄은 가맹점 아님
        !/누적/.test(l) &&
        !/\d{1,2}\/\d{1,2}/.test(l)
    );
  if (!merchant) return null;

  return {
    amount: amountMatch ? parseAmount(amountMatch[1]) : usdKrw!,
    merchant,
    date: parseDateMMDD(dateMatch[1], smsDate),
    payment_method: "우리카드",
  };
};
