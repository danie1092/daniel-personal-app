"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { revalidatePath } from "next/cache";
import { DIARY_EMOTIONS } from "@/lib/constants";

export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const MAX_CONTENT = 8192;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export type DiaryInput = {
  content: string;
  emotion: string;
};

function validate(date: string, input: DiaryInput): { ok: true } | { ok: false; error: string } {
  if (!DATE_REGEX.test(date)) return { ok: false, error: "잘못된 날짜" };
  if (typeof input.content !== "string") return { ok: false, error: "잘못된 내용" };
  const trimmed = input.content.trim();
  if (trimmed.length === 0) return { ok: false, error: "내용이 비어 있어요" };
  if (trimmed.length > MAX_CONTENT) return { ok: false, error: "내용이 너무 길어요" };
  if (input.emotion !== "" && !DIARY_EMOTIONS.includes(input.emotion as (typeof DIARY_EMOTIONS)[number])) {
    return { ok: false, error: "잘못된 감정" };
  }
  return { ok: true };
}

function revalidate() {
  revalidatePath("/diary");
  revalidatePath("/home");
}

export async function upsertTodayDiary(date: string, input: DiaryInput): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  const v = validate(date, input);
  if (!v.ok) return v;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("diary_entries")
      .upsert(
        {
          date,
          content: input.content.trim(),
          emotion: input.emotion === "" ? null : input.emotion,
        },
        { onConflict: "date" }
      );
    if (error) return { ok: false, error: "Save failed" };
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("upsertTodayDiary:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Save failed" };
  }
}

export async function updateDiary(id: string, input: DiaryInput & { date: string }): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };
  const v = validate(input.date, { content: input.content, emotion: input.emotion });
  if (!v.ok) return v;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("diary_entries")
      .update({
        content: input.content.trim(),
        emotion: input.emotion === "" ? null : input.emotion,
      })
      .eq("id", id);
    if (error) return { ok: false, error: "Update failed" };
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("updateDiary:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Update failed" };
  }
}

export async function deleteDiary(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("diary_entries").delete().eq("id", id);
    if (error) return { ok: false, error: "Delete failed" };
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("deleteDiary:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Delete failed" };
  }
}
