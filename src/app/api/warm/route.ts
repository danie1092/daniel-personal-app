import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * keep-warm 엔드포인트 — 서버리스 함수 콜드스타트(첫 진입 ~2s) 방지용.
 * 맥미니 크론이 몇 분마다 핑한다. 인증 불필요(자격증명 저장 없음), 데이터 노출 없음.
 * Next 런타임 + Supabase 서버 클라이언트/DB 연결 경로를 깨워 둔다.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    // head:true → 행을 받지 않고(데이터 노출 0) 쿼리/연결 경로만 워밍.
    await supabase.from("budget_entries").select("id", { count: "exact", head: true });
  } catch {
    // 워밍 실패는 무시 — 런타임을 깨우는 것 자체가 목적.
  }
  return NextResponse.json({ ok: true, ts: Date.now() });
}
