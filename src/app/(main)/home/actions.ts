"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { revalidatePath } from "next/cache";
import { MEMO_TAGS } from "@/lib/constants";

const MAX_CONTENT = 512;

export type QuickMemoResult = { ok: true } | { ok: false; error: string };

export async function createQuickMemo(content: string): Promise<QuickMemoResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  const trimmed = content.trim();
  if (!trimmed || trimmed.length > MAX_CONTENT) {
    return { ok: false, error: "Invalid content" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("memo_entries")
    .insert({ content: trimmed, tag: MEMO_TAGS[0] });

  if (error) return { ok: false, error: "Save failed" };

  revalidatePath("/home");
  revalidatePath("/memo");
  return { ok: true };
}
