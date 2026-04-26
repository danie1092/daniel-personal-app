import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireBearer } from "@/lib/auth/requireBearer";

export async function POST(request: NextRequest) {
  const auth = requireBearer(request, process.env.COLLECT_API_KEY);
  if (!auth.ok) return auth.response;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await request.json();
    const { url, memo, source = "instagram" } = body ?? {};

    if (!url || typeof url !== "string" || url.length > 2048) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }
    if (memo && (typeof memo !== "string" || memo.length > 1024)) {
      return NextResponse.json({ error: "Memo too long" }, { status: 400 });
    }

    // 스킴 화이트리스트 (저장 단계에서도 한 번 더 막음)
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return NextResponse.json({ error: "Invalid URL scheme" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Malformed URL" }, { status: 400 });
    }

    const userId = process.env.DEFAULT_USER_ID!;

    const { data: existing } = await supabase
      .from("collected_items")
      .select("id")
      .eq("user_id", userId)
      .eq("url", url)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { message: "Already collected", duplicate: true },
        { status: 200 }
      );
    }

    const { data, error } = await supabase
      .from("collected_items")
      .insert({
        user_id: userId,
        url,
        memo: memo || null,
        source,
        is_processed: false,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Collect API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
