import { BUDGET_CATEGORIES } from "@/lib/constants";

export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export type CategoryToken = {
  emoji: string;
  /** Tailwind classes for category dot (small chip) */
  bg: string;
  text: string;
  /** Hex for donut chart segments */
  hex: string;
};

export const CATEGORY_TOKENS: Record<BudgetCategory, CategoryToken> = {
  고정지출: { emoji: "📌", bg: "bg-violet-50",  text: "text-violet-700",  hex: "#7C3AED" },
  할부:    { emoji: "💳", bg: "bg-purple-50",  text: "text-purple-700",  hex: "#9333EA" },
  식사:    { emoji: "🍚", bg: "bg-emerald-50", text: "text-emerald-700", hex: "#059669" },
  카페:    { emoji: "☕", bg: "bg-orange-50",  text: "text-orange-700",  hex: "#EA580C" },
  간식:    { emoji: "🍪", bg: "bg-amber-50",   text: "text-amber-700",   hex: "#D97706" },
  생필품:  { emoji: "🧴", bg: "bg-lime-50",    text: "text-lime-700",    hex: "#65A30D" },
  교통:    { emoji: "🚕", bg: "bg-indigo-50",  text: "text-indigo-700",  hex: "#4338CA" },
  취미:    { emoji: "🎨", bg: "bg-pink-50",    text: "text-pink-700",    hex: "#DB2777" },
  회사:    { emoji: "💼", bg: "bg-slate-50",   text: "text-slate-600",   hex: "#475569" },
  병원:    { emoji: "💊", bg: "bg-teal-50",    text: "text-teal-700",    hex: "#0F766E" },
  도파민:  { emoji: "💸", bg: "bg-rose-50",    text: "text-rose-700",    hex: "#E11D48" },
  월급:    { emoji: "💰", bg: "bg-green-50",   text: "text-green-700",   hex: "#16A34A" },
  저축:    { emoji: "🏦", bg: "bg-sky-50",     text: "text-sky-700",     hex: "#0284C7" },
};

export function entryType(category: BudgetCategory): "income" | "saving" | "expense" {
  if (category === "월급") return "income";
  if (category === "저축") return "saving";
  return "expense";
}

export const NO_PAYMENT_CATEGORIES: ReadonlySet<BudgetCategory> = new Set([
  "월급",
  "저축",
] as const);
