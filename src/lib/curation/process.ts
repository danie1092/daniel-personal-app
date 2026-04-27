import { createClient } from "@supabase/supabase-js";
import { safeFetch } from "@/lib/og/safeFetch";
import { parseOGMeta } from "@/lib/og/parseMeta";
import { curateItem } from "./curate";

export type ProcessOutcome = "success" | "transient_failure" | "permanent_failure" | "skipped";

type Row = {
  id: string;
  url: string;
  memo: string | null;
  processed_at: string | null;
  processing_attempts?: number;
};

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function processCollectedItem(itemId: string): Promise<ProcessOutcome> {
  const sb = getSupabase();
  const { data: row, error: selErr } = await sb
    .from("collected_items")
    .select("id, url, memo, processed_at, processing_attempts")
    .eq("id", itemId)
    .maybeSingle();

  if (selErr || !row) return "permanent_failure";
  const r = row as Row;
  if (r.processed_at) return "skipped";

  // OG fetch (best-effort)
  let ogTitle = "", ogDescription = "", ogImage = "";
  const og = await safeFetch(r.url);
  if (!og.error && "body" in og) {
    const meta = parseOGMeta(og.body);
    ogTitle = meta.title;
    ogDescription = meta.description;
    ogImage = meta.image;
  }

  // curate
  const result = await curateItem({
    url: r.url,
    memo: r.memo,
    ogTitle,
    ogDescription,
  });

  if (result.ok) {
    await sb
      .from("collected_items")
      .update({
        summary: result.summary,
        category: result.category,
        og_title: ogTitle || null,
        og_description: ogDescription || null,
        og_image: ogImage || null,
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", itemId);
    return "success";
  }

  // 실패 — attempts 증가만
  const nextAttempts = (r.processing_attempts ?? 0) + 1;
  await sb
    .from("collected_items")
    .update({
      processing_attempts: nextAttempts,
      last_error: `${result.kind}: ${result.error}`.slice(0, 500),
    })
    .eq("id", itemId);

  return result.kind === "transient" ? "transient_failure" : "permanent_failure";
}
