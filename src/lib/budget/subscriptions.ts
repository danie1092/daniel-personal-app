import { createClient } from "@/lib/supabase/server";
import type { BudgetEntry } from "./monthData";

/**
 * 구독·고정지출 자동탐지.
 *
 * 카드 SMS로 쌓인 budget_entries 에서 "매달 반복되는 결제"를 가맹점 단위로 묶어
 * 숨은 구독/고정지출 목록을 만든다. 잔소리(예산 경보)는 하지 않고, 보여주기만 한다.
 */

export type Subscription = {
  /** 정규화된 표시 이름 (가맹점) */
  name: string;
  /** 대표 카테고리 (가장 자주 붙은 것) */
  category: string;
  /** 대표 월 금액 (중앙값) */
  typicalAmount: number;
  /** 관측된 distinct 월 (YYYY-MM, 오름차순) */
  months: string[];
  /** 총 결제 건수 */
  occurrences: number;
  /** 가장 최근 결제일 (YYYY-MM-DD) */
  lastDate: string;
  /** 처음 관측된 월 (YYYY-MM) */
  firstMonth: string;
  /** 거의 매달(연속) 빠지면 monthly, 띄엄띄엄이면 irregular */
  cadence: "monthly" | "irregular";
  /** 이번 달에 처음 잡힌 신규 정기결제인지 */
  isNew: boolean;
};

/** 탐지에 필요한 최소 필드 (BudgetEntry 호환, category 는 문자열로 느슨하게) */
export type SubscriptionInput = {
  date: string;
  category: string;
  description: string | null;
  memo: string | null;
  amount: number;
  type: string;
};

export type DetectOptions = {
  /** 구독으로 인정할 최소 distinct 월 수 (기본 2). 단 '구독' 카테고리는 1달도 인정 */
  minMonths?: number;
  /** "이번 달" 기준 (YYYY-MM). isNew 판정용. 미지정 시 오늘 기준 */
  nowYearMonth?: string;
};

/** 분류기가 이미 구독/고정성으로 판단한 카테고리 — 신뢰하고 그대로 인정 */
const TRUSTED_CATEGORIES = new Set(["구독·렌탈", "고정비"]);

/** 미분류 등 비신뢰 카테고리에서 구독으로 인정할 조건 */
const MAX_CHARGES_PER_MONTH = 1.6; // 월 1회꼴 (편의점·택시처럼 잦은 건 제외)
const AMOUNT_TOLERANCE = 0.25; // 대표금액 ±25% 안에 들어야 (금액 들쭉날쭉 제외)

function yearMonth(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * description/memo 에서 가맹점 식별 키를 뽑는다.
 * 숫자·승인/일시불/할부 등 결제 노이즈·괄호내용을 제거하고 소문자/공백 정규화.
 */
export function merchantKey(entry: Pick<BudgetEntry, "description" | "memo">): string {
  const raw = (entry.description || entry.memo || "").trim();
  return raw
    .replace(/\(.*?\)/g, " ") // 괄호 내용 제거
    .replace(/[0-9,]+\s*원?/g, " ") // 금액/숫자 제거
    .replace(/일시불|할부|개월|승인|취소|결제|체크|신용|카드|구독|정기/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ") // 기호 → 공백
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** YYYY-MM 들이 연속(또는 1달 갭 이내)으로 이어지는지 → monthly 판정 */
function isMostlyConsecutive(months: string[]): boolean {
  if (months.length < 2) return false;
  const idx = months.map((m) => {
    const [y, mm] = m.split("-").map(Number);
    return y * 12 + (mm - 1);
  });
  let gaps = 0;
  for (let i = 1; i < idx.length; i++) {
    const gap = idx[i] - idx[i - 1];
    if (gap > 2) return false; // 2달 넘게 비면 irregular
    if (gap === 2) gaps++;
  }
  return gaps <= 1;
}

/**
 * 순수 탐지 함수. entries(여러 달치)를 받아 구독/고정지출 목록을 반환.
 * Supabase 등 외부 의존 없음 → 단위테스트 용이.
 */
export function detectSubscriptions(
  entries: SubscriptionInput[],
  opts: DetectOptions = {}
): Subscription[] {
  const minMonths = opts.minMonths ?? 2;
  const now = opts.nowYearMonth ?? currentYearMonth();

  // 지출만 (수입·저축 제외)
  const expenses = entries.filter(
    (e) => e.type !== "income" && e.type !== "saving" && e.amount > 0
  );

  const groups = new Map<string, typeof expenses>();
  for (const e of expenses) {
    const key = merchantKey(e);
    if (!key) continue;
    const arr = groups.get(key);
    if (arr) arr.push(e);
    else groups.set(key, [e]);
  }

  const subs: Subscription[] = [];
  for (const [, items] of groups) {
    const months = [...new Set(items.map((e) => yearMonth(e.date)))].sort();
    // 대표 카테고리 (최빈)
    const catCount = new Map<string, number>();
    for (const e of items) catCount.set(e.category, (catCount.get(e.category) || 0) + 1);
    const category = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0][0];

    const amounts = items.map((e) => e.amount);
    const med = median(amounts);

    // 인정 조건:
    //  - 신뢰 카테고리(구독/고정지출/할부): 분류기를 믿고 그대로 인정 (1개월도 OK → 신규)
    //  - 그 외(미분류 등): 2개월 이상 + 월 1회꼴 + 금액 일정 (편의점·택시 오탐 방지)
    let qualifies: boolean;
    if (TRUSTED_CATEGORIES.has(category)) {
      qualifies = true;
    } else {
      const chargesPerMonth = items.length / months.length;
      const amountStable =
        med > 0 && amounts.every((a) => Math.abs(a - med) <= med * AMOUNT_TOLERANCE);
      qualifies =
        months.length >= minMonths &&
        chargesPerMonth <= MAX_CHARGES_PER_MONTH &&
        amountStable;
    }
    if (!qualifies) continue;

    const sortedByDate = [...items].sort((a, b) => (a.date < b.date ? 1 : -1));
    const lastDate = sortedByDate[0].date;
    // 표시 이름: 가장 최근 항목의 원문 설명 우선
    const name = (sortedByDate[0].description || sortedByDate[0].memo || "").trim();

    subs.push({
      name: name || merchantKey(sortedByDate[0]),
      category,
      typicalAmount: med,
      months,
      occurrences: items.length,
      lastDate,
      firstMonth: months[0],
      cadence: isMostlyConsecutive(months) ? "monthly" : "irregular",
      isNew: months.length === 1 && months[0] === now,
    });
  }

  // 월 금액 큰 순
  return subs.sort((a, b) => b.typicalAmount - a.typicalAmount);
}

/** 최근 N개월치 지출 entries 조회 (구독탐지 입력용) */
export async function getRecentEntries(months = 4): Promise<BudgetEntry[]> {
  const supabase = await createClient();
  const d = new Date();
  d.setMonth(d.getMonth() - (months - 1));
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const { data } = await supabase
    .from("budget_entries")
    .select(
      "id, date, category, description, memo, amount, payment_method, type, created_at"
    )
    .gte("date", start)
    .order("date", { ascending: false });
  return (data ?? []) as BudgetEntry[];
}

/** 탐지된 구독들의 월 합계 */
export function monthlySubscriptionTotal(subs: Subscription[]): number {
  return subs
    .filter((s) => s.cadence === "monthly")
    .reduce((sum, s) => sum + s.typicalAmount, 0);
}
