import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * merchant_category_map에서 (user_id, merchant) 조회.
 * 히트 시 저장된 카테고리, 미스 시 "미분류".
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

  return (data as { category: string } | null)?.category ?? "미분류";
}
