import { createClient } from "@/lib/supabase/server";

/**
 * 고정비 항목 — DB(fixed_expenses) 관리. 가계부 "고정비" 탭에서 추가/수정/삭제.
 * 이 목록의 합이 고정비 예산 타깃이자 총예산의 고정비 몫이 된다.
 */

export type FixedExpense = {
  id: string;
  description: string;
  amount: number;
  payment_method: string | null;
  sort_order: number;
};

export async function getFixedExpenses(): Promise<FixedExpense[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fixed_expenses")
    .select("id, description, amount, payment_method, sort_order")
    .order("sort_order", { ascending: true });
  return (data ?? []) as FixedExpense[];
}

/** 고정비 타깃 = 항목 합계 */
export function fixedExpensesTotal(items: Pick<FixedExpense, "amount">[]): number {
  return items.reduce((sum, e) => sum + e.amount, 0);
}

/** 합계만 필요할 때 (요약/트래커) */
export async function getFixedExpensesTotal(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("fixed_expenses").select("amount");
  return fixedExpensesTotal((data ?? []) as { amount: number }[]);
}
