"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { revalidatePath } from "next/cache";
import { MEMO_TAGS } from "@/lib/constants";

export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const MAX_CONTENT = 8192;

export type MemoInput = { content: string; tag: string };

function validateMemo(input: MemoInput): { ok: true } | { ok: false; error: string } {
  if (typeof input.content !== "string") return { ok: false, error: "잘못된 내용" };
  const trimmed = input.content.trim();
  if (trimmed.length === 0) return { ok: false, error: "내용이 비어 있어요" };
  if (trimmed.length > MAX_CONTENT) return { ok: false, error: "내용이 너무 길어요" };
  if (typeof input.tag !== "string" || !MEMO_TAGS.includes(input.tag as (typeof MEMO_TAGS)[number])) {
    return { ok: false, error: "잘못된 태그" };
  }
  return { ok: true };
}

function revalidate() {
  revalidatePath("/memo");
  revalidatePath("/home");
}

export async function createMemo(input: MemoInput): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  const v = validateMemo(input);
  if (!v.ok) return v;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("memo_entries")
      .insert({ content: input.content.trim(), tag: input.tag })
      .select("id")
      .single();
    if (error) return { ok: false, error: "Save failed" };
    revalidate();
    return { ok: true, id: (data as { id: string }).id };
  } catch (err) {
    console.error("createMemo:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Save failed" };
  }
}

export async function updateMemo(id: string, input: MemoInput): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };
  const v = validateMemo(input);
  if (!v.ok) return v;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("memo_entries")
      .update({ content: input.content.trim(), tag: input.tag })
      .eq("id", id);
    if (error) return { ok: false, error: "Update failed" };
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("updateMemo:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Update failed" };
  }
}

export async function deleteMemo(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("memo_entries").delete().eq("id", id);
    if (error) return { ok: false, error: "Delete failed" };
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("deleteMemo:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Delete failed" };
  }
}
