import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── 파싱 ──────────────────────────────────────────────────────────────────────

interface Parsed {
  amount: number;
  merchant: string;
  date: string;
  payment_method: string;
}

/** "13,200원" → 13200 */
function parseAmount(raw: string): number {
  return parseInt(raw.replace(/[^0-9]/g, ""), 10);
}

/** "4/7" | "04/06" → "2026-04-07" */
function parseDate(mmdd: string): string {
  const [m, d] = mmdd.trim().split("/");
  const year = new Date().getFullYear();
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseHyundai(text: string): Parsed | null {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const amountMatch = text.match(/([\d,]+)원/);
  const dateMatch   = text.match(/(\d{1,2}\/\d{1,2})\s+\d{2}:\d{2}/);
  if (!amountMatch || !dateMatch) return null;

  let merchant: string;

  // SMS 형식: [Web발신] 포함 → 날짜 다음 줄이 가맹점
  // "[Web발신]\n현대카드MM 승인\n함*영\n9,712원 일시불\n04/07 15:29\n교보문고\n누적..."
  if (text.includes("[Web발신]")) {
    const dateLine = lines.findIndex(l => /^\d{2}\/\d{2}\s+\d{2}:\d{2}$/.test(l));
    if (dateLine === -1 || dateLine + 1 >= lines.length) return null;
    merchant = lines[dateLine + 1];
  } else {
    // 앱 알림 형식: 마지막 줄이 가맹점
    // "함다영 님, 현대카드MM 승인\n13,200원 일시불, 4/7 14:07\n메가엠지씨커피응암이마트점"
    merchant = lines[lines.length - 1];
  }

  if (!merchant) return null;

  return {
    amount:         parseAmount(amountMatch[1]),
    merchant,
    date:           parseDate(dateMatch[1]),
    payment_method: "현대카드",
  };
}

function parseWoori(text: string): Parsed | null {
  // [일시불.승인(0157)]04/06 23:15\n5,080원 / 누적:1,493,167원\n쿠팡(쿠페이)
  const dateMatch   = text.match(/\](\d{2}\/\d{2})\s+\d{2}:\d{2}/);
  const amountMatch = text.match(/([\d,]+)원\s*\//);
  const lines       = text.split("\n");
  const merchant    = lines[lines.length - 1].trim();

  if (!amountMatch || !dateMatch || !merchant) return null;

  return {
    amount:         parseAmount(amountMatch[1]),
    merchant,
    date:           parseDate(dateMatch[1]),
    payment_method: "우리카드",
  };
}

function parse(raw: string): Parsed {
  const text = raw.trim();

  if (text.includes("현대카드")) {
    const result = parseHyundai(text);
    if (result) return result;
  }

  if (text.includes("일시불.승인") || text.includes("우리카드")) {
    const result = parseWoori(text);
    if (result) return result;
  }

  throw new Error("지원하지 않는 카드 알림 형식입니다.");
}

// ── 핸들러 ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let raw_text: string;

  try {
    const body = await req.json();
    raw_text = body?.raw_text;
    if (typeof raw_text !== "string" || !raw_text.trim()) {
      return NextResponse.json({ ok: false, error: "raw_text가 필요합니다." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  let parsed: Parsed;
  try {
    parsed = parse(raw_text);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  const { data, error } = await supabase
    .from("budget_entries")
    .insert({
      amount:         parsed.amount,
      memo:           parsed.merchant,
      date:           parsed.date,
      payment_method: parsed.payment_method,
      category:       "미분류",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, entry: data });
}
