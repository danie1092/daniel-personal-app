import type { ParseFn } from "./types";
import { parseAmount, parseDateMMDD } from "./utils";

/**
 * 하나카드 SMS.
 *   하나3*0*체크승인 함*영 22,750원06/23 19:23 쿠팡(쿠페이)
 *   하나7*1*신용승인 함*영 12,000원06/23 19:23 스타벅스
 *   하나7*1*승인 함*영 35,570원 일시불 07/01 23:53 쿠팡(쿠페이) 누적6,957,283원  ← 간편결제(종류 미표기)
 *
 * 금액(…원)·날짜(MM/DD)·시각(HH:MM). 가맹점은 시각 뒤 나머지("누적…원" 꼬리는 제거).
 * 신용/체크: 문자에 '신용'/'체크'가 있으면 그대로, 없으면(간편결제 등) 마스킹 카드번호
 * 앞자리로 추론 — 7*1*=신용, 3*0*=체크 (다니 하나카드 규칙).
 */
export const parseHana: ParseFn = (text, smsDate) => {
  if (!text.includes("하나")) return null;
  if (!text.includes("승인")) return null;

  const amountMatch = text.match(/([\d,]+)원/);
  const dateTimeMatch = text.match(/(\d{1,2}\/\d{1,2})\s+\d{1,2}:\d{2}/);
  if (!amountMatch || !dateTimeMatch) return null;

  const merchant = text
    .slice(text.indexOf(dateTimeMatch[0]) + dateTimeMatch[0].length)
    .split("누적")[0] // "쿠팡(쿠페이) 누적6,957,283원" → "쿠팡(쿠페이)"
    .trim();
  if (!merchant) return null;

  // 카드 종류: 명시 우선, 없으면 마스킹 앞자리로 추론
  let cardType: "신용" | "체크" | null = null;
  if (text.includes("신용")) cardType = "신용";
  else if (text.includes("체크")) cardType = "체크";
  else {
    const lead = text.match(/하나\s*(\d)/);
    if (lead?.[1] === "7") cardType = "신용";
    else if (lead?.[1] === "3") cardType = "체크";
  }

  return {
    amount: parseAmount(amountMatch[1]),
    merchant,
    date: parseDateMMDD(dateTimeMatch[1], smsDate),
    payment_method: cardType ? `하나(${cardType})` : "하나카드",
  };
};
