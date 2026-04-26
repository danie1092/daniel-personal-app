"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { revalidatePath } from "next/cache";
import { MEMO_TAGS } from "@/lib/constants";
import Anthropic from "@anthropic-ai/sdk";
import { safeFetch } from "@/lib/og/safeFetch";
import { parseOGMeta } from "@/lib/og/parseMeta";

export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const MAX_CONTENT = 8192;
const MAX_GROUPS = 50;

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

export type InboxGroup = {
  topic: string;
  tag: string;
  content: string;
  item_ids: string[];
};

function validateGroup(g: unknown): g is InboxGroup {
  if (!g || typeof g !== "object") return false;
  const o = g as Record<string, unknown>;
  if (typeof o.tag !== "string") return false;
  if (typeof o.content !== "string") return false;
  if (o.content.length > MAX_CONTENT) return false;
  if (!Array.isArray(o.item_ids)) return false;
  if (!MEMO_TAGS.includes(o.tag as (typeof MEMO_TAGS)[number])) return false;
  return true;
}

export async function saveInboxGroups(groups: InboxGroup[]): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (!Array.isArray(groups) || groups.length === 0) return { ok: false, error: "저장할 데이터가 없습니다" };
  if (groups.length > MAX_GROUPS) return { ok: false, error: "그룹 수 초과" };
  for (const g of groups) {
    if (!validateGroup(g)) return { ok: false, error: "잘못된 그룹 형식" };
  }

  try {
    const supabase = await createClient();
    const memoInserts = groups.map((g) => ({ content: g.content, tag: g.tag }));
    const { error: memoErr } = await supabase.from("memo_entries").insert(memoInserts);
    if (memoErr) return { ok: false, error: "Save failed" };

    const allItemIds = groups.flatMap((g) => g.item_ids);
    if (allItemIds.length > 0) {
      const { error: updErr } = await supabase
        .from("collected_items")
        .update({ is_processed: true })
        .in("id", allItemIds);
      if (updErr) return { ok: false, error: "Update failed" };
    }

    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("saveInboxGroups:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Save failed" };
  }
}

async function fetchOGMeta(url: string) {
  const result = await safeFetch(url);
  if (result.error || !("body" in result)) {
    return { title: "", description: "", image: "" };
  }
  return parseOGMeta(result.body);
}

export async function organizeInbox(): Promise<ActionResult<{ groups: InboxGroup[] }>> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  try {
    const supabase = await createClient();
    const { data: items, error } = await supabase
      .from("collected_items")
      .select("id, url, source, memo")
      .eq("is_processed", false)
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: "Lookup failed" };
    if (!items || items.length === 0) return { ok: true, groups: [] };

    const enriched = await Promise.all(
      (items as { id: string; url: string; source: string; memo: string | null }[]).map(async (item) => ({
        ...item,
        og: await fetchOGMeta(item.url),
      }))
    );

    const itemsText = enriched
      .map(
        (item, i) =>
          `[${i + 1}] id: ${item.id}\n    URL: ${item.url}\n    source: ${item.source}\n    memo: ${item.memo || "(없음)"}\n    OG title: ${item.og.title || "(없음)"}\n    OG description: ${item.og.description || "(없음)"}`
      )
      .join("\n\n");

    const tagList = MEMO_TAGS.join(", ");

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `아래는 사용자가 수집한 URL 목록입니다. 이 항목들을 분석해서 주제별로 묶고, 각 그룹에 대해 메모 초안을 작성해주세요.

규칙:
1. 중복 URL이 있으면 하나로 합칩니다
2. 비슷한 주제의 항목을 그룹으로 묶습니다
3. 각 그룹에 대해 한국어 메모 초안을 작성합니다 (간결하고 유용하게)
4. 각 그룹에 가장 적절한 태그를 선택합니다. 사용 가능한 태그: ${tagList}
5. 반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이)

JSON 형식:
{
  "groups": [
    {
      "topic": "주제 이름",
      "tag": "태그",
      "content": "메모 초안 내용 (URL 포함)",
      "item_ids": ["id1", "id2"]
    }
  ]
}

수집된 항목:
${itemsText}`,
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, error: "AI 응답 파싱 실패" };

    const parsed = JSON.parse(jsonMatch[0]);
    const groups = (parsed.groups ?? []) as InboxGroup[];
    return { ok: true, groups };
  } catch (err) {
    console.error("organizeInbox:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Organize failed" };
  }
}
