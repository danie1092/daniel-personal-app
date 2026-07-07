import { createClient } from "@/lib/supabase/server";

/**
 * 정규(매월 반복) 커스텀 카테고리 — budget_custom_categories 테이블.
 * 예산 편성의 특별예산을 "정규 전환"하면 여기로 들어온다 (예: 외식과 분리한 '식료품').
 * effective_from 사이클부터 매달 변동예산에 자동 포함되고,
 * 지출 입력의 카테고리 선택지에도 추가된다.
 */

export type CustomCategory = {
  name: string;
  amount: number;
  /** 이 사이클(YYYY-MM)부터 예산에 포함 */
  effective_from: string;
};

export async function getCustomCategories(): Promise<CustomCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("budget_custom_categories")
    .select("name, amount, effective_from")
    .order("created_at", { ascending: true });
  return (data ?? []) as CustomCategory[];
}

/** 그 사이클에 적용되는 커스텀 카테고리 예산 맵. 순수 함수. */
export function customTargetsFor(
  customs: CustomCategory[],
  yearMonth: string
): Record<string, number> {
  const targets: Record<string, number> = {};
  for (const c of customs) {
    if (c.effective_from <= yearMonth) targets[c.name] = c.amount;
  }
  return targets;
}
