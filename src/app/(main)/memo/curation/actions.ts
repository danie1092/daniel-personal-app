"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { revalidatePath } from "next/cache";
import { isCurationCategory, type CurationCategory } from "@/lib/curation/categories";
import { processCollectedItem } from "@/lib/curation/process";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/memo");
}

export async function updateCurationCategory(
  id: string,
  category: CurationCategory
): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };
  if (!isCurationCategory(category)) return { ok: false, error: "잘못된 카테고리" };

  try {
    const sb = await createClient();
    const { error } = await sb
      .from("collected_items")
      .update({ category })
      .eq("id", id);
    if (error) return { ok: false, error: "Update failed" };
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("updateCurationCategory:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Update failed" };
  }
}

export async function deleteCuration(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };
  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };

  try {
    const sb = await createClient();
    const { error } = await sb.from("collected_items").delete().eq("id", id);
    if (error) return { ok: false, error: "Delete failed" };
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("deleteCuration:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Delete failed" };
  }
}

export async function reprocessCuration(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };
  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };

  try {
    const sb = await createClient();
    const { error } = await sb
      .from("collected_items")
      .update({ processed_at: null, processing_attempts: 0, last_error: null })
      .eq("id", id);
    if (error) return { ok: false, error: "Reset failed" };

    // 인라인 1회 시도 (실패해도 cron이 다음 라운드에서 다시)
    try {
      await processCollectedItem(id);
    } catch (err) {
      console.error("reprocessCuration inline:", err instanceof Error ? err.message : "unknown");
    }

    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("reprocessCuration:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Reprocess failed" };
  }
}
