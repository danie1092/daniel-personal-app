"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { revalidatePath } from "next/cache";
import { BUDGET_CATEGORIES, PAYMENT_METHODS, FIXED_EXPENSES } from "@/lib/constants";
import { entryType, NO_PAYMENT_CATEGORIES, type BudgetCategory } from "@/lib/budget/categoryTokens";

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const MAX_AMOUNT = 999_999_999;
const MAX_DESCRIPTION = 200;
const MAX_MEMO = 500;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const YM_REGEX = /^\d{4}-\d{2}$/;

export type EntryInput = {
  date: string;
  category: BudgetCategory;
  description: string;
  memo: string;
  amount: number;
  paymentMethod: string | null;
};

function validateEntry(input: EntryInput): { ok: true } | { ok: false; error: string } {
  if (!DATE_REGEX.test(input.date)) return { ok: false, error: "잘못된 날짜" };
  if (!BUDGET_CATEGORIES.includes(input.category as (typeof BUDGET_CATEGORIES)[number])) {
    return { ok: false, error: "잘못된 카테고리" };
  }
  if (typeof input.amount !== "number" || !Number.isInteger(input.amount) || input.amount < 0 || input.amount > MAX_AMOUNT) {
    return { ok: false, error: "잘못된 금액" };
  }
  if (typeof input.description !== "string" || input.description.length > MAX_DESCRIPTION) {
    return { ok: false, error: "설명이 너무 김" };
  }
  if (typeof input.memo !== "string" || input.memo.length > MAX_MEMO) {
    return { ok: false, error: "메모가 너무 김" };
  }
  if (input.paymentMethod !== null && !PAYMENT_METHODS.includes(input.paymentMethod as (typeof PAYMENT_METHODS)[number])) {
    return { ok: false, error: "잘못된 결제수단" };
  }
  return { ok: true };
}

function normalizePayment(category: BudgetCategory, paymentMethod: string | null): string | null {
  if (NO_PAYMENT_CATEGORIES.has(category)) return null;
  return paymentMethod;
}

export async function createBudgetEntry(input: EntryInput): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  const v = validateEntry(input);
  if (!v.ok) return v;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("budget_entries")
      .insert({
        date: input.date,
        category: input.category,
        description: input.description || null,
        memo: input.memo || null,
        amount: input.amount,
        payment_method: normalizePayment(input.category, input.paymentMethod),
        type: entryType(input.category),
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: "Save failed" };
    revalidatePath("/budget");
    revalidatePath("/home");
    return { ok: true, id: (data as { id: string }).id };
  } catch (err) {
    console.error("createBudgetEntry:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Save failed" };
  }
}

export async function updateBudgetEntry(id: string, input: EntryInput): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof id !== "string" || id.length === 0) return { ok: false, error: "잘못된 id" };

  const v = validateEntry(input);
  if (!v.ok) return v;

  try {
    const supabase = await createClient();
    const userId = session.user.id;

    // 1) 현재 카테고리 조회 (학습 트리거 판정용)
    const { data: current, error: selErr } = await supabase
      .from("budget_entries")
      .select("category, memo")
      .eq("id", id)
      .single();
    if (selErr || !current) return { ok: false, error: "Not found" };

    const prevCategory = (current as { category: string }).category;

    // 2) entry 본인 update
    const { error: updErr } = await supabase
      .from("budget_entries")
      .update({
        date: input.date,
        category: input.category,
        description: input.description || null,
        memo: input.memo || null,
        amount: input.amount,
        payment_method: normalizePayment(input.category, input.paymentMethod),
        type: entryType(input.category),
      })
      .eq("id", id);

    if (updErr) return { ok: false, error: "Update failed" };

    // 3) 학습 트리거: 미분류 → 분류된 카테고리로 변경된 경우만.
    // BUDGET_CATEGORIES엔 "미분류"가 없어서 input.category는 항상 분류된 값.
    // (UI에서도 "미분류" 선택 불가) → prev만 체크하면 충분.
    const shouldLearn =
      prevCategory === "미분류" &&
      typeof input.memo === "string" &&
      input.memo.length > 0;

    if (shouldLearn) {
      // 3-1) 사전 upsert
      const { error: upsertErr } = await supabase
        .from("merchant_category_map")
        .upsert(
          { user_id: userId, merchant: input.memo, category: input.category },
          { onConflict: "user_id,merchant" }
        );
      if (upsertErr) {
        console.error("merchant_category_map upsert:", upsertErr.message);
      }

      // 3-2) 같은 merchant + 미분류 entries 일괄 update
      // budget_entries에 user_id 컬럼이 없으므로 user 매칭 X (단일 사용자 앱)
      const { error: bulkErr } = await supabase
        .from("budget_entries")
        .update({ category: input.category, type: entryType(input.category) })
        .eq("memo", input.memo)
        .eq("category", "미분류");
      if (bulkErr) {
        console.error("budget bulk update:", bulkErr.message);
      }
    }

    revalidatePath("/budget");
    revalidatePath("/home");
    return { ok: true };
  } catch (err) {
    console.error("updateBudgetEntry:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Update failed" };
  }
}

export async function deleteBudgetEntry(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof id !== "string" || id.length === 0) return { ok: false, error: "잘못된 id" };

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("budget_entries").delete().eq("id", id);
    if (error) return { ok: false, error: "Delete failed" };
    revalidatePath("/budget");
    revalidatePath("/home");
    return { ok: true };
  } catch (err) {
    console.error("deleteBudgetEntry:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Delete failed" };
  }
}

export async function addFixedExpenses(yearMonth: string): Promise<ActionResult<{ added: number; skipped: number }>> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (!YM_REGEX.test(yearMonth)) return { ok: false, error: "잘못된 yearMonth" };

  try {
    const supabase = await createClient();
    const start = `${yearMonth}-01`;
    const [y, m] = yearMonth.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;

    const { data: existing, error: existErr } = await supabase
      .from("budget_entries")
      .select("description")
      .eq("category", "고정지출")
      .gte("date", start)
      .lte("date", end);

    if (existErr) return { ok: false, error: "Lookup failed" };

    const existingNames = new Set(((existing ?? []) as { description: string | null }[]).map((e) => e.description));
    const toInsert = FIXED_EXPENSES.filter((e) => !existingNames.has(e.description));

    if (toInsert.length === 0) {
      return { ok: true, added: 0, skipped: existingNames.size };
    }

    const { error: insErr } = await supabase.from("budget_entries").insert(
      toInsert.map((e) => ({
        date: start,
        category: "고정지출",
        description: e.description,
        memo: null,
        amount: e.amount,
        payment_method: e.paymentMethod,
        type: "expense" as const,
      }))
    );

    if (insErr) return { ok: false, error: "Insert failed" };

    revalidatePath("/budget");
    revalidatePath("/home");
    return { ok: true, added: toInsert.length, skipped: existingNames.size };
  } catch (err) {
    console.error("addFixedExpenses:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Failed" };
  }
}
