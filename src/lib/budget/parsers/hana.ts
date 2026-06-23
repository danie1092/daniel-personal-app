import type { ParseFn } from "./types";
import { parseAmount, parseDateMMDD } from "./utils";

/**
 * 하나카드 SMS.
 *   하나3*0*체크승인 함*영 22,750원06/23 19:23 쿠팡(쿠페이)
 *   하나7*1*신용승인 함*영 12,000원06/23 19:23 스타벅스
 *
 * 특징: 금액(…원)과 날짜(MM/DD)가 공백 없이 붙어 옴. 가맹점은 시각(HH:MM) 뒤 나머지 전부.
 */
export const parseHana: ParseFn = (text, smsDate) => {
  if (!text.includes("하나")) return null;
  if (!text.includes("체크승인") && !text.includes("신용승인")) return null;

  const amountMatch = text.match(/([\d,]+)원/);
  const dateTimeMatch = text.match(/(\d{1,2}\/\d{1,2})\s+\d{1,2}:\d{2}/);
  if (!amountMatch || !dateTimeMatch) return null;

  const merchant = text
    .slice(text.indexOf(dateTimeMatch[0]) + dateTimeMatch[0].length)
    .trim();
  if (!merchant) return null;

  return {
    amount: parseAmount(amountMatch[1]),
    merchant,
    date: parseDateMMDD(dateTimeMatch[1], smsDate),
    payment_method: "하나카드",
  };
};
