import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { groups } = await request.json();

    if (!groups || !Array.isArray(groups) || groups.length === 0) {
      return Response.json({ error: "저장할 데이터가 없습니다" }, { status: 400 });
    }

    // memo_entries에 각 그룹 저장
    const memoInserts = groups.map((g: { tag: string; content: string }) => ({
      content: g.content,
      tag: g.tag,
    }));

    const { error: memoError } = await supabase
      .from("memo_entries")
      .insert(memoInserts);

    if (memoError) throw memoError;

    // collected_items의 is_processed 업데이트
    const allItemIds = groups.flatMap(
      (g: { item_ids: string[] }) => g.item_ids
    );

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
