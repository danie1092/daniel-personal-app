import type { SupabaseClient } from "@supabase/supabase-js";
import { BUDGET_CATEGORIES } from "@/lib/constants";

/**
 * merchant_category_map에서 (user_id, merchant) 조회.
 * 히트 시 저장된 카테고리, 미스 또는 BUDGET_CATEGORIES 외 값일 때 "미분류".
 */
export async function lookupCategory(
  supabase: SupabaseClient,
  userId: string,
  merchant: string
): Promise<string> {
  const { data } = await supabase
    .from("merchant_category_map")
    .select("category")
    .eq("user_id", userId)
    .eq("merchant", merchant)
    .maybeSingle();

  const category = (data as { category: string } | null)?.category;
  if (!category) return "미분류";
  if (!BUDGET_CATEGORIES.includes(category as (typeof BUDGET_CATEGORIES)[number])) {
    return "미분류";
  }
  return category;
}
