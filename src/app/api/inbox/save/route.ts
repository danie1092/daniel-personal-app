import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/requireSession";

const MAX_GROUPS = 50;
const MAX_CONTENT = 8192;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { groups } = body ?? {};

    if (!Array.isArray(groups) || groups.length === 0) {
      return Response.json({ error: "저장할 데이터가 없습니다" }, { status: 400 });
    }
    if (groups.length > MAX_GROUPS) {
      return Response.json({ error: "그룹 수 초과" }, { status: 400 });
    }
    for (const g of groups) {
      if (
        typeof g?.tag !== "string" ||
        typeof g?.content !== "string" ||
        g.content.length > MAX_CONTENT ||
        !Array.isArray(g?.item_ids)
      ) {
        return Response.json({ error: "잘못된 그룹 형식" }, { status: 400 });
      }
    }

    const memoInserts = groups.map((g: { tag: string; content: string }) => ({
      content: g.content,
      tag: g.tag,
    }));

    const { error: memoError } = await supabase.from("memo_entries").insert(memoInserts);
    if (memoError) throw memoError;

    const allItemIds = groups.flatMap((g: { item_ids: string[] }) => g.item_ids);
    if (allItemIds.length > 0) {
      const { error: updateError } = await supabase
        .from("collected_items")
        .update({ is_processed: true })
        .in("id", allItemIds);
      if (updateError) throw updateError;
    }

    return Response.json({ success: true, saved: groups.length });
  } catch (err) {
    console.error("Save error:", err);
    return Response.json({ error: "저장 중 오류 발생" }, { status: 500 });
  }
}
