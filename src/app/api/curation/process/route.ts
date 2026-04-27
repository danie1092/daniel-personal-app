import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";
import { processCollectedItem, type ProcessOutcome } from "@/lib/curation/process";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 20;

export async function POST(request: Request) {
  const auth = requireCronSecret(request);
  if (!auth.ok) return auth.response;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await sb
    .from("collected_items")
    .select("id")
    .is("processed_at", null)
    .lt("processing_attempts", 5)
    .eq("is_processed", false)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("curation/process select:", error.message);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const counts: Record<ProcessOutcome, number> = {
    success: 0,
    transient_failure: 0,
    permanent_failure: 0,
    skipped: 0,
  };

  // 직렬 처리 (Anthropic 5xx 폭주 시 동시성으로 손해 키우지 않게)
  for (const id of ids) {
    try {
      const out = await processCollectedItem(id);
      counts[out] = (counts[out] ?? 0) + 1;
    } catch (err) {
      console.error("curation/process item:", err instanceof Error ? err.message : "unknown");
      counts.permanent_failure += 1;
    }
  }

  return NextResponse.json({
    processed: ids.length,
    success: counts.success,
    transient: counts.transient_failure,
    permanent: counts.permanent_failure,
    skipped: counts.skipped,
  });
}
