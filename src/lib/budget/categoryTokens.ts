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
  온라인쇼핑:        { emoji: "🛒", bg: "bg-purple-50",  text: "text-purple-700",  hex: "#9333EA" },
  고정비:            { emoji: "📌", bg: "bg-violet-50",  text: "text-violet-700",  hex: "#7C3AED" },
  "의료·건강":       { emoji: "💊", bg: "bg-teal-50",    text: "text-teal-700",    hex: "#0F766E" },
  "구독·렌탈":       { emoji: "📺", bg: "bg-cyan-50",    text: "text-cyan-700",    hex: "#0891B2" },
  교통:              { emoji: "🚕", bg: "bg-indigo-50",  text: "text-indigo-700",  hex: "#4338CA" },
  카페:              { emoji: "☕", bg: "bg-orange-50",  text: "text-orange-700",  hex: "#EA580C" },
  "편의점·마트·잡화": { emoji: "🧺", bg: "bg-lime-50",    text: "text-lime-700",    hex: "#65A30D" },
  외식:              { emoji: "🍚", bg: "bg-emerald-50", text: "text-emerald-700", hex: "#059669" },
  기타기호품:        { emoji: "🍪", bg: "bg-amber-50",   text: "text-amber-700",   hex: "#D97706" },
  기타:              { emoji: "📦", bg: "bg-slate-50",   text: "text-slate-600",   hex: "#475569" },
  월급:              { emoji: "💰", bg: "bg-green-50",   text: "text-green-700",   hex: "#16A34A" },
  저축:              { emoji: "🏦", bg: "bg-sky-50",     text: "text-sky-700",     hex: "#0284C7" },
  미분류:            { emoji: "❔", bg: "bg-zinc-100",   text: "text-zinc-600",    hex: "#71717A" },
};

/** 정규 전환된 커스텀 카테고리 (CATEGORY_TOKENS에 없는 이름) 공용 토큰 */
export const CUSTOM_CATEGORY_TOKEN: CategoryToken = {
  emoji: "🏷️", bg: "bg-rose-50", text: "text-rose-700", hex: "#BE185D",
};

/** 카테고리 토큰 조회 — 커스텀 카테고리는 공용 토큰으로 폴백 */
export function tokenOf(category: string): CategoryToken {
  return CATEGORY_TOKENS[category as BudgetCategory] ?? CUSTOM_CATEGORY_TOKEN;
}

/** 카테고리 선택지 순서 — 커스텀은 지출 카테고리 끝('기타' 뒤), 월급·저축·미분류 앞 */
export function categoryPickerOrder(customCategories: string[]): string[] {
  const base: string[] = [...BUDGET_CATEGORIES];
  const idx = base.indexOf("기타") + 1;
  return [...base.slice(0, idx), ...customCategories, ...base.slice(idx)];
}

/** 커스텀 카테고리는 항상 지출 */
export function entryType(category: string): "income" | "saving" | "expense" {
  if (category === "월급") return "income";
  if (category === "저축") return "saving";
  return "expense";
}

export const NO_PAYMENT_CATEGORIES: ReadonlySet<string> = new Set([
  "월급",
  "저축",
] as const);
