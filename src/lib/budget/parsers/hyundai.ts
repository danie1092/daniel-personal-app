import type { ParseFn } from "./types";
import { parseAmount, parseDateMMDD } from "./utils";

export const parseHyundai: ParseFn = (text, smsDate) => {
  if (!text.includes("현대카드")) return null;

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const amountMatch = text.match(/([\d,]+)원/);
  const dateMatch = text.match(/(\d{1,2}\/\d{1,2})\s+\d{2}:\d{2}/);
  if (!amountMatch || !dateMatch) return null;

  let merchant: string;

  if (text.includes("[Web발신]")) {
    // [Web발신] 형식: 날짜 라인 (예: "04/07 15:29") 다음 줄이 가맹점
    const dateLineIdx = lines.findIndex((l) => /^\d{1,2}\/\d{1,2}\s+\d{2}:\d{2}$/.test(l));
    if (dateLineIdx === -1 || dateLineIdx + 1 >= lines.length) return null;
    merchant = lines[dateLineIdx + 1];
  } else {
    // 앱 알림 형식: 마지막 줄이 가맹점
    merchant = lines[lines.length - 1];
  }

  if (!merchant) return null;

  return {
    amount: parseAmount(amountMatch[1]),
    merchant,
    date: parseDateMMDD(dateMatch[1], smsDate),
    payment_method: "현대카드",
  };
};
