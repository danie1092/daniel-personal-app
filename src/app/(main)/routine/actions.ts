"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { revalidatePath } from "next/cache";

export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME = 100;
const MAX_EMOJI = 16;

function revalidate() {
  revalidatePath("/routine");
  revalidatePath("/home");
}

export async function toggleRoutineCheck(
  itemId: string,
  date: string,
  checked: boolean
): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof itemId !== "string" || !itemId) return { ok: false, error: "잘못된 itemId" };
  if (!DATE_REGEX.test(date)) return { ok: false, error: "잘못된 날짜" };

  try {
    const supabase = await createClient();
    if (checked) {
      const { error } = await supabase
        .from("routine_checks")
        .upsert(
          { item_id: itemId, date, checked: true },
          { onConflict: "item_id,date" }
        );
      if (error) return { ok: false, error: "Save failed" };
    } else {
      const { error } = await supabase
        .from("routine_checks")
        .delete()
        .eq("item_id", itemId)
        .eq("date", date);
      if (error) return { ok: false, error: "Save failed" };
    }
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("toggleRoutineCheck:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Save failed" };
  }
}

export type ItemInput = { name: string; emoji: string };

function validateItem(input: ItemInput): { ok: true } | { ok: false; error: string } {
  if (typeof input.name !== "string") return { ok: false, error: "잘못된 이름" };
  const trimmed = input.name.trim();
  if (trimmed.length === 0) return { ok: false, error: "이름이 비어 있어요" };
  if (trimmed.length > MAX_NAME) return { ok: false, error: "이름이 너무 길어요" };
  if (typeof input.emoji !== "string") return { ok: false, error: "잘못된 이모지" };
  if (input.emoji.length > MAX_EMOJI) return { ok: false, error: "이모지가 너무 길어요" };
  return { ok: true };
}

export async function createRoutineItem(input: ItemInput): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  const v = validateItem(input);
  if (!v.ok) return v;

  try {
    const supabase = await createClient();
    // 현재 max sort_order 조회
    const { data: existing } = await supabase
      .from("routine_items")
      .select("sort_order")
      .order("sort_order", { ascending: false });
    const rows = (existing ?? []) as { sort_order: number }[];
    const nextOrder = rows.length > 0 ? rows[0].sort_order + 1 : 0;

    const { data, error } = await supabase
      .from("routine_items")
      .insert({
        name: input.name.trim(),
        emoji: input.emoji.trim() || "✅",
        sort_order: nextOrder,
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: "Save failed" };
    revalidate();
    return { ok: true, id: (data as { id: string }).id };
  } catch (err) {
    console.error("createRoutineItem:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Save failed" };
  }
}

export async function updateRoutineItem(id: string, input: ItemInput): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };
  const v = validateItem(input);
  if (!v.ok) return v;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("routine_items")
      .update({ name: input.name.trim(), emoji: input.emoji.trim() || "✅" })
      .eq("id", id);
    if (error) return { ok: false, error: "Update failed" };
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("updateRoutineItem:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Update failed" };
  }
}

export async function deleteRoutineItem(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("routine_items").delete().eq("id", id);
    if (error) return { ok: false, error: "Delete failed" };
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("deleteRoutineItem:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Delete failed" };
  }
}

export async function moveRoutineItem(id: string, direction: "up" | "down"): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };
  if (direction !== "up" && direction !== "down") return { ok: false, error: "잘못된 방향" };

  try {
    const supabase = await createClient();
    const { data: items } = await supabase
      .from("routine_items")
      .select("id, sort_order")
      .order("sort_order", { ascending: true });
    const list = (items ?? []) as { id: string; sort_order: number }[];
    const idx = list.findIndex((it) => it.id === id);
    if (idx === -1) return { ok: false, error: "항목 없음" };
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return { ok: true };
    const a = list[idx];
    const b = list[swapIdx];
    await Promise.all([
      supabase.from("routine_items").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("routine_items").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("moveRoutineItem:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Move failed" };
  }
}
