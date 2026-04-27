import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireBearer } from "@/lib/auth/requireBearer";
import { checkBudgetSmsLimit } from "@/lib/rateLimit/upstash";
import { parse } from "@/lib/budget/parsers";
import { lookupCategory } from "@/lib/budget/categorize";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MAX_RAW_TEXT = 4 * 1024; // 4KB
const MAX_AMOUNT = 999_999_999;

export async function POST(req: NextRequest) {
  // 1. 인증
  const auth = requireBearer(req, process.env.BUDGET_SMS_SECRET);
  if (!auth.ok) return auth.response;

  // 2. rate limit
  const limit = await checkBudgetSmsLimit();
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
    );
  }

  // 3. 입력 파싱 + 길이 제한
  let raw_text: string;
  let smsDateMs: number | undefined;
  try {
    const body = await req.json();
    raw_text = body?.raw_text;
    if (typeof raw_text !== "string" || !raw_text.trim()) {
      return NextResponse.json({ error: "raw_text가 필요합니다" }, { status: 400 });
    }
    if (raw_text.length > MAX_RAW_TEXT) {
      return NextResponse.json({ error: "raw_text 4KB 초과" }, { status: 400 });
    }
    if (typeof body?.sms_date_ms === "number") smsDateMs = body.sms_date_ms;
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }

  // 4. SMS 날짜 (poll.sh가 보내준 게 있으면 사용, 없으면 현재 시각)
  const smsDate = smsDateMs ? new Date(smsDateMs) : new Date();

  // 5. 카드 파서
  const parsed = parse(raw_text, smsDate);
  if (!parsed) {
    return NextResponse.json({ error: "지원하지 않는 카드 알림 형식" }, { status: 422 });
  }
  if (!Number.isInteger(parsed.amount) || parsed.amount <= 0 || parsed.amount > MAX_AMOUNT) {
    return NextResponse.json({ error: "잘못된 금액" }, { status: 422 });
  }

  // 6. 사전 조회 + INSERT
  // budget_entries엔 user_id 컬럼이 없음 (단일 사용자 앱). INSERT payload에도 없음.
  // merchant_category_map 조회는 user_id 매칭 필요 (RLS).
  const userId = process.env.DEFAULT_USER_ID!;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const category = await lookupCategory(supabase, userId, parsed.merchant);

  const { data, error } = await supabase
    .from("budget_entries")
    .insert({
      date: parsed.date,
      amount: parsed.amount,
      memo: parsed.merchant,
      payment_method: parsed.payment_method,
      category,
      type: "expense",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // UNIQUE 충돌 = 이미 처리된 결제. 정상 흐름의 일부.
      return NextResponse.json({ ok: true, duplicate: true }, { status: 409 });
    }
    console.error("/api/budget/auto insert:", error.message);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, entry: data, category }, { status: 201 });
}
