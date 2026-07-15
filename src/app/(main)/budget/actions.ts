"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { revalidatePath } from "next/cache";
import { BUDGET_CATEGORIES, BUDGET_TARGETS, PAYMENT_METHODS } from "@/lib/constants";
import { getFixedExpenses } from "@/lib/budget/fixedExpenses";
import { budgetMonthOf } from "@/lib/budget/cycle";
import { nowKST } from "@/lib/kst";
import { entryType, NO_PAYMENT_CATEGORIES } from "@/lib/budget/categoryTokens";
import { getCustomCategories } from "@/lib/budget/customCategories";

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
  /** 기본 카테고리 또는 정규 전환된 커스텀 카테고리 이름 */
  category: string;
  description: string;
  memo: string;
  amount: number;
  paymentMethod: string | null;
};

/** 기본 카테고리 + 정규 커스텀 카테고리 이름 집합 (엔트리 검증용) */
async function allowedCategories(): Promise<Set<string>> {
  const customs = await getCustomCategories();
  return new Set<string>([...BUDGET_CATEGORIES, ...customs.map((c) => c.name)]);
}

function validateEntry(
  input: EntryInput,
  allowed: ReadonlySet<string>
): { ok: true } | { ok: false; error: string } {
  if (!DATE_REGEX.test(input.date)) return { ok: false, error: "잘못된 날짜" };
  if (!allowed.has(input.category)) {
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

function normalizePayment(category: string, paymentMethod: string | null): string | null {
  if (NO_PAYMENT_CATEGORIES.has(category)) return null;
  return paymentMethod;
}

export async function createBudgetEntry(input: EntryInput): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  const v = validateEntry(input, await allowedCategories());
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

  const v = validateEntry(input, await allowedCategories());
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
    const shouldLearn =
      prevCategory === "미분류" &&
      input.category !== "미분류" &&
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
      .eq("category", "고정비")
      .gte("date", start)
      .lte("date", end);

    if (existErr) return { ok: false, error: "Lookup failed" };

    const fixedItems = await getFixedExpenses();
    const existingNames = new Set(((existing ?? []) as { description: string | null }[]).map((e) => e.description));
    const toInsert = fixedItems.filter((e) => !existingNames.has(e.description));

    if (toInsert.length === 0) {
      return { ok: true, added: 0, skipped: existingNames.size };
    }

    const { error: insErr } = await supabase.from("budget_entries").insert(
      toInsert.map((e) => ({
        date: start,
        category: "고정비",
        description: e.description,
        memo: null,
        amount: e.amount,
        payment_method: e.payment_method,
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

// ── 고정비 항목 관리 (fixed_expenses 테이블) ──────────────────────────

export type FixedExpenseInput = {
  description: string;
  amount: number;
  paymentMethod: string | null;
};

function validateFixedExpense(input: FixedExpenseInput): { ok: true } | { ok: false; error: string } {
  if (typeof input.description !== "string" || !input.description.trim() || input.description.length > MAX_DESCRIPTION) {
    return { ok: false, error: "이름을 입력하세요" };
  }
  if (typeof input.amount !== "number" || !Number.isInteger(input.amount) || input.amount < 0 || input.amount > MAX_AMOUNT) {
    return { ok: false, error: "잘못된 금액" };
  }
  if (input.paymentMethod !== null && !PAYMENT_METHODS.includes(input.paymentMethod as (typeof PAYMENT_METHODS)[number])) {
    return { ok: false, error: "잘못된 결제수단" };
  }
  return { ok: true };
}

export async function createFixedExpense(input: FixedExpenseInput): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };
  const v = validateFixedExpense(input);
  if (!v.ok) return v;

  try {
    const supabase = await createClient();
    // 새 항목은 목록 맨 뒤로
    const { data: maxRow } = await supabase
      .from("fixed_expenses")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((maxRow as { sort_order: number } | null)?.sort_order ?? 0) + 1;

    const { data, error } = await supabase
      .from("fixed_expenses")
      .insert({
        description: input.description.trim(),
        amount: input.amount,
        payment_method: input.paymentMethod,
        sort_order: nextOrder,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: "Save failed" };
    revalidatePath("/budget");
    revalidatePath("/home");
    return { ok: true, id: (data as { id: string }).id };
  } catch (err) {
    console.error("createFixedExpense:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Save failed" };
  }
}

export async function updateFixedExpense(id: string, input: FixedExpenseInput): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };
  if (typeof id !== "string" || id.length === 0) return { ok: false, error: "잘못된 id" };
  const v = validateFixedExpense(input);
  if (!v.ok) return v;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("fixed_expenses")
      .update({
        description: input.description.trim(),
        amount: input.amount,
        payment_method: input.paymentMethod,
      })
      .eq("id", id);
    if (error) return { ok: false, error: "Update failed" };
    revalidatePath("/budget");
    revalidatePath("/home");
    return { ok: true };
  } catch (err) {
    console.error("updateFixedExpense:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Update failed" };
  }
}

export async function deleteFixedExpense(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };
  if (typeof id !== "string" || id.length === 0) return { ok: false, error: "잘못된 id" };

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("fixed_expenses").delete().eq("id", id);
    if (error) return { ok: false, error: "Delete failed" };
    revalidatePath("/budget");
    revalidatePath("/home");
    return { ok: true };
  } catch (err) {
    console.error("deleteFixedExpense:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Delete failed" };
  }
}

// ── 다음달 예산 편성 (budget_plans) ──────────────────────────────

const MAX_PLAN_CATEGORY = 30;

/** 편성은 미래 사이클만 — 당월을 열어두면 달성률 맞추려고 예산을 고치게 된다 (사용자 결정) */
function assertFutureCycle(yearMonth: string): { ok: true } | { ok: false; error: string } {
  if (!YM_REGEX.test(yearMonth)) return { ok: false, error: "잘못된 yearMonth" };
  if (yearMonth <= budgetMonthOf(nowKST())) {
    return { ok: false, error: "당월/과거 예산은 수정할 수 없어요 (다음달부터 편성 가능)" };
  }
  return { ok: true };
}

/** 다음달 카테고리 예산 오버라이드 또는 특별예산 항목 저장 */
export async function upsertBudgetPlan(
  yearMonth: string,
  category: string,
  amount: number
): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  const future = assertFutureCycle(yearMonth);
  if (!future.ok) return future;
  if (typeof category !== "string" || !category.trim() || category.length > MAX_PLAN_CATEGORY) {
    return { ok: false, error: "잘못된 항목 이름" };
  }
  if (category.trim() === "고정비") {
    return { ok: false, error: "고정비는 고정비 탭에서 관리해요" };
  }
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT) {
    return { ok: false, error: "잘못된 금액" };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("budget_plans")
      .upsert(
        { year_month: yearMonth, category: category.trim(), amount },
        { onConflict: "year_month,category" }
      );
    if (error) return { ok: false, error: "Save failed" };
    revalidatePath("/budget");
    return { ok: true };
  } catch (err) {
    console.error("upsertBudgetPlan:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Save failed" };
  }
}

/** 오버라이드 제거(기본값 복귀) 또는 특별예산 항목 삭제 */
export async function deleteBudgetPlan(yearMonth: string, category: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  const future = assertFutureCycle(yearMonth);
  if (!future.ok) return future;
  if (typeof category !== "string" || !category.trim()) return { ok: false, error: "잘못된 항목" };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("budget_plans")
      .delete()
      .eq("year_month", yearMonth)
      .eq("category", category);
    if (error) return { ok: false, error: "Delete failed" };
    revalidatePath("/budget");
    return { ok: true };
  } catch (err) {
    console.error("deleteBudgetPlan:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Delete failed" };
  }
}

// ── 특별예산 → 정규(매월 반복) 전환 ──────────────────────────────

/**
 * 특별예산(budget_plans의 커스텀 이름 항목)을 정규 카테고리로 전환.
 * 전환하면 yearMonth 사이클부터 매달 예산에 자동 포함되고,
 * 지출 입력의 카테고리 선택지에도 올라온다. 기존 편성 줄은 흡수되어 삭제.
 */
export async function convertPlanToRegular(
  yearMonth: string,
  category: string
): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  const future = assertFutureCycle(yearMonth);
  if (!future.ok) return future;
  const name = typeof category === "string" ? category.trim() : "";
  if (!name || name.length > MAX_PLAN_CATEGORY) return { ok: false, error: "잘못된 항목" };
  if (BUDGET_CATEGORIES.includes(name as (typeof BUDGET_CATEGORIES)[number]) || name in BUDGET_TARGETS) {
    return { ok: false, error: "기본 카테고리는 이미 정규예요" };
  }

  try {
    const supabase = await createClient();
    const { data: plan, error: selErr } = await supabase
      .from("budget_plans")
      .select("amount")
      .eq("year_month", yearMonth)
      .eq("category", name)
      .maybeSingle();
    if (selErr || !plan) return { ok: false, error: "편성에 없는 항목이에요" };

    const { error: insErr } = await supabase.from("budget_custom_categories").upsert(
      {
        name,
        amount: (plan as { amount: number }).amount,
        effective_from: yearMonth,
      },
      { onConflict: "name" }
    );
    if (insErr) return { ok: false, error: "전환 실패" };

    // 정규 기본값이 됐으니 특별예산 줄은 제거 (남기면 같은 금액의 중복 오버라이드)
    const { error: delErr } = await supabase
      .from("budget_plans")
      .delete()
      .eq("year_month", yearMonth)
      .eq("category", name);
    if (delErr) console.error("convertPlanToRegular cleanup:", delErr.message);

    revalidatePath("/budget");
    revalidatePath("/home");
    return { ok: true };
  } catch (err) {
    console.error("convertPlanToRegular:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "전환 실패" };
  }
}

/** 정규 전환된 커스텀 카테고리 삭제 (기존 지출 내역의 카테고리는 그대로 남음) */
export async function removeCustomCategory(name: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };
  if (typeof name !== "string" || !name.trim()) return { ok: false, error: "잘못된 항목" };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("budget_custom_categories")
      .delete()
      .eq("name", name.trim());
    if (error) return { ok: false, error: "Delete failed" };
    revalidatePath("/budget");
    revalidatePath("/home");
    return { ok: true };
  } catch (err) {
    console.error("removeCustomCategory:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Delete failed" };
  }
}

// ── 저축 목표 ─────────────────────────────────────────────────────

/** 홈 저축 카드의 목표 금액 설정/변경 (단일 행 upsert) */
export async function upsertSavingsGoal(amount: number): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return { ok: false, error: "잘못된 금액" };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("savings_goal")
      .upsert({ id: true, target_amount: amount, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) return { ok: false, error: "Save failed" };
    revalidatePath("/home");
    revalidatePath("/budget");
    return { ok: true };
  } catch (err) {
    console.error("upsertSavingsGoal:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Save failed" };
  }
}

// ── 구독 탭 제외 목록 ─────────────────────────────────────────────

/**
 * 자동 감지된 반복 결제를 고정비 항목으로 승격.
 * 고정비 목록에 추가하고, 감지 목록에서는 제외해 중복 표시를 막는다.
 */
export async function registerSubscriptionAsFixed(input: {
  merchantKey: string;
  description: string;
  amount: number;
}): Promise<ActionResult> {
  if (typeof input.merchantKey !== "string" || !input.merchantKey.trim() || input.merchantKey.length > 200) {
    return { ok: false, error: "잘못된 항목" };
  }
  const created = await createFixedExpense({
    description: input.description,
    amount: input.amount,
    paymentMethod: null,
  });
  if (!created.ok) return created;
  return excludeSubscription(input.merchantKey);
}

/** 구독 탭 자동탐지 결과에서 이 가맹점(merchantKey)을 숨긴다 */
export async function excludeSubscription(merchantKey: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };
  if (typeof merchantKey !== "string" || !merchantKey.trim() || merchantKey.length > 200) {
    return { ok: false, error: "잘못된 항목" };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("subscription_exclusions")
      .upsert({ merchant_key: merchantKey }, { onConflict: "merchant_key" });
    if (error) return { ok: false, error: "Delete failed" };
    revalidatePath("/budget");
    return { ok: true };
  } catch (err) {
    console.error("excludeSubscription:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Delete failed" };
  }
}
