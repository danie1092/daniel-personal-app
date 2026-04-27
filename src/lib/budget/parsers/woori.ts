import type { ParseFn } from "./types";
import { parseAmount, parseDateMMDD } from "./utils";

export const parseWoori: ParseFn = (text, smsDate) => {
  if (!text.includes("일시불.승인") && !text.includes("우리카드")) return null;

  const dateMatch = text.match(/\](\d{2}\/\d{2})\s+\d{2}:\d{2}/);
  const amountMatch = text.match(/([\d,]+)원\s*\//);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const merchant = lines[lines.length - 1];

  if (!amountMatch || !dateMatch || !merchant) return null;

  return {
    amount: parseAmount(amountMatch[1]),
    merchant,
    date: parseDateMMDD(dateMatch[1], smsDate),
    payment_method: "우리카드",
  };
};
