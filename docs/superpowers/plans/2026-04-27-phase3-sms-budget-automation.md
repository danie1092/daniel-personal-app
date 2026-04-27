# Phase 3 — SMS 결제문자 가계부 자동입력 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 맥미니 메시지 앱이 받은 카드 결제 SMS를 30초 이내에 `/api/budget/auto`로 자동 POST하고, `merchant_category_map` 사전 기반으로 카테고리 자동 분류, 사용자가 미분류를 분류하는 동작만으로 사전이 자동 학습되는 흐름을 만든다.

**Architecture:** 맥미니의 launchd가 30초마다 `poll.sh`를 실행 → SQLite로 `chat.db`에서 결제 SMS만 SELECT → curl로 Vercel API에 POST. API는 `requireBearer` 인증 + Upstash rate limit + 카드별 파서 + 사전 조회 후 `budget_entries` INSERT. UNIQUE 제약으로 중복 방지. 가계부 페이지의 `updateBudgetEntry` Server Action에 "미분류 → 분류" 변경 감지 시 자동 학습 + 같은 merchant 미분류 일괄 업데이트 로직 합침.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Vitest, `@supabase/supabase-js` (service role), `@supabase/ssr`, `@upstash/ratelimit`, macOS launchd + bash + sqlite3.

**Working directory:** `/Users/daniel_home/daniel-personal-app`
**Branch:** `phase3-sms-budget-automation` (already created from `main`, spec commits cherry-picked)
**Spec:** `docs/superpowers/specs/2026-04-27-phase3-sms-budget-automation-design.md`

---

## File Structure

### 신규

```
supabase_migration_phase3_sms.sql           # merchant_category_map + UNIQUE 제약

src/lib/budget/parsers/
  types.ts                                  # Parsed 타입 + ParseFn 시그니처
  utils.ts                                  # parseAmount, parseDateMMDD (smsDate 기반 연도)
  hyundai.ts                                # 현대카드 파서 (앱알림 + Web발신 두 형식)
  hyundai.test.ts                           # 3 tests
  woori.ts                                  # 우리카드 파서
  woori.test.ts                             # 2 tests
  index.ts                                  # parsers 배열 + parse(text, smsDate)
  index.test.ts                             # 2 tests (라우팅, 매칭 실패)

src/lib/budget/categorize.ts                # lookupCategory(supabase, userId, merchant)
src/lib/budget/categorize.test.ts           # 2 tests (hit, miss)

# 맥미니 측 (사용자 home, ~/Library/Application Support는 Time Machine 백업 제외 경로)
~/Library/Application Support/budget-sms/
  poll.sh                                   # sqlite3 SELECT + curl POST
  setup.sh                                  # 권한 안내 + plist load + state 초기화
  com.daniel.budget-sms.plist               # launchd agent (StartInterval=30)
  README.md                                 # 설치 / 디버깅 절차
  # secret.env, state.txt, *.log 는 setup.sh가 생성

docs/operations/budget-sms-runbook.md       # secret 로테이션, 새 카드 추가, 디버깅
```

### 수정

```
src/lib/rateLimit/upstash.ts                # checkBudgetSmsLimit 추가
src/app/api/budget/auto/route.ts            # 재작성: requireBearer + rate limit + parsers + categorize + INSERT
src/app/(main)/budget/actions.ts            # updateBudgetEntry에 학습 + 일괄 update 로직
src/app/(main)/budget/actions.test.ts       # 학습 테스트 추가
```

---

## Task 1: Supabase 마이그레이션

**Files:**
- Create: `supabase_migration_phase3_sms.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase_migration_phase3_sms.sql

-- 1. merchant→category 사전 (사용자가 미분류 entry를 분류할 때 자동 학습됨)
CREATE TABLE IF NOT EXISTS merchant_category_map (
  user_id    uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant   text          NOT NULL,
  category   text          NOT NULL,
  updated_at timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, merchant)
);

ALTER TABLE merchant_category_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own rows" ON merchant_category_map
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. budget_entries 중복 방지 UNIQUE 제약
-- (정확히 같은 결제가 두 번 들어오는 경우는 0이라고 가정)
ALTER TABLE budget_entries
  ADD CONSTRAINT budget_entries_dedup_uniq
  UNIQUE (user_id, date, amount, memo, payment_method);
```

- [ ] **Step 2: 사용자에게 실행 안내**

이 task는 코드 변경 없음. 사용자가 Supabase Dashboard → SQL Editor에서 위 SQL 실행. 실행 결과 (table 1개 + constraint 1개) 확인.

- [ ] **Step 3: 커밋**

```bash
git add supabase_migration_phase3_sms.sql
git commit -m "feat(phase3): Supabase 마이그레이션 — merchant_category_map + dedup UNIQUE"
```

---

## Task 2: Parser 공통 타입/유틸

**Files:**
- Create: `src/lib/budget/parsers/types.ts`
- Create: `src/lib/budget/parsers/utils.ts`
- Create: `src/lib/budget/parsers/utils.test.ts`

- [ ] **Step 1: 타입 작성**

```ts
// src/lib/budget/parsers/types.ts

export type Parsed = {
  amount: number;
  merchant: string;
  date: string;            // YYYY-MM-DD (KST)
  payment_method: string;
};

export type ParseFn = (text: string, smsDate: Date) => Parsed | null;
```

- [ ] **Step 2: utils 테스트 작성 (실패 확인)**

```ts
// src/lib/budget/parsers/utils.test.ts
import { describe, test, expect } from "vitest";
import { parseAmount, parseDateMMDD } from "./utils";

describe("parseAmount", () => {
  test("13,200원 → 13200", () => {
    expect(parseAmount("13,200원")).toBe(13200);
  });

  test("9,712원 일시불 → 9712", () => {
    expect(parseAmount("9,712원 일시불")).toBe(9712);
  });

  test("숫자 없으면 NaN", () => {
    expect(parseAmount("원")).toBeNaN();
  });
});

describe("parseDateMMDD", () => {
  test("같은 해 결제 (4/7, smsDate 2026-04-07) → 2026-04-07", () => {
    const smsDate = new Date("2026-04-07T15:29:00+09:00");
    expect(parseDateMMDD("4/7", smsDate)).toBe("2026-04-07");
  });

  test("연말 결제 (12/31, smsDate 2027-01-01) → 2026-12-31", () => {
    // SMS는 1월 1일에 도착했지만 결제는 12/31. 메시지 날짜의 월(1) > 결제 월(12) → 전년도
    const smsDate = new Date("2027-01-01T00:30:00+09:00");
    expect(parseDateMMDD("12/31", smsDate)).toBe("2026-12-31");
  });

  test("MM/DD 정규화 (04/06)", () => {
    const smsDate = new Date("2026-04-06T23:15:00+09:00");
    expect(parseDateMMDD("04/06", smsDate)).toBe("2026-04-06");
  });
});
```

Run: `cd /Users/daniel_home/daniel-personal-app && npx vitest run src/lib/budget/parsers/utils.test.ts`
Expected: FAIL (utils.ts 없음)

- [ ] **Step 3: utils 구현**

```ts
// src/lib/budget/parsers/utils.ts

/** "13,200원" → 13200, 숫자 없으면 NaN */
export function parseAmount(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 0) return NaN;
  return parseInt(digits, 10);
}

/**
 * "MM/DD" 또는 "M/D" + smsDate(KST) → "YYYY-MM-DD"
 * 결제 월이 SMS 도착 월보다 크면 전년도 결제로 간주 (예: 1월에 12월 결제 통보 도착)
 */
export function parseDateMMDD(mmdd: string, smsDate: Date): string {
  const [m, d] = mmdd.trim().split("/").map((s) => parseInt(s, 10));

  // KST 기준 연/월 계산
  const kst = new Date(smsDate.getTime() + 9 * 60 * 60 * 1000);
  const smsYear = kst.getUTCFullYear();
  const smsMonth = kst.getUTCMonth() + 1;

  const year = m > smsMonth ? smsYear - 1 : smsYear;

  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/budget/parsers/utils.test.ts`
Expected: PASS (3 + 3 = 6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/budget/parsers/types.ts src/lib/budget/parsers/utils.ts src/lib/budget/parsers/utils.test.ts
git commit -m "feat(phase3): parser 공통 타입 + parseAmount/parseDateMMDD 유틸"
```

---

## Task 3: 현대카드 파서

**Files:**
- Create: `src/lib/budget/parsers/hyundai.ts`
- Create: `src/lib/budget/parsers/hyundai.test.ts`

- [ ] **Step 1: 테스트 작성 (실패 확인)**

```ts
// src/lib/budget/parsers/hyundai.test.ts
import { describe, test, expect } from "vitest";
import { parseHyundai } from "./hyundai";

const SMS_DATE = new Date("2026-04-07T15:30:00+09:00");

describe("parseHyundai", () => {
  test("[Web발신] 형식", () => {
    const text = `[Web발신]
현대카드MM 승인
함*영
9,712원 일시불
04/07 15:29
교보문고
누적 누적금액`;
    expect(parseHyundai(text, SMS_DATE)).toEqual({
      amount: 9712,
      merchant: "교보문고",
      date: "2026-04-07",
      payment_method: "현대카드",
    });
  });

  test("앱 알림 형식 (마지막 줄 = 가맹점)", () => {
    const text = `함다영 님, 현대카드MM 승인
13,200원 일시불, 4/7 14:07
메가엠지씨커피응암이마트점`;
    expect(parseHyundai(text, SMS_DATE)).toEqual({
      amount: 13200,
      merchant: "메가엠지씨커피응암이마트점",
      date: "2026-04-07",
      payment_method: "현대카드",
    });
  });

  test("현대카드 키워드 없으면 null", () => {
    expect(parseHyundai("우리카드 승인 1000원\n4/7 12:00\n스벅", SMS_DATE)).toBeNull();
  });
});
```

Run: `npx vitest run src/lib/budget/parsers/hyundai.test.ts`
Expected: FAIL (hyundai.ts 없음)

- [ ] **Step 2: 구현**

```ts
// src/lib/budget/parsers/hyundai.ts
import type { Parsed, ParseFn } from "./types";
import { parseAmount, parseDateMMDD } from "./utils";

export const parseHyundai: ParseFn = (text, smsDate) => {
  if (!text.includes("현대카드")) return null;

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const amountMatch = text.match(/([\d,]+)원/);
  const dateMatch = text.match(/(\d{1,2}\/\d{1,2})\s+\d{2}:\d{2}/);
  if (!amountMatch || !dateMatch) return null;

  let merchant: string;

  if (text.includes("[Web발신]")) {
    // [Web발신] 형식: 날짜 라인 (예: "04/07 15:29") 다음 줄이 가맹점
    const dateLineIdx = lines.findIndex((l) => /^\d{1,2}\/\d{1,2}\s+\d{2}:\d{2}$/.test(l));
    if (dateLineIdx === -1 || dateLineIdx + 1 >= lines.length) return null;
    merchant = lines[dateLineIdx + 1];
  } else {
    // 앱 알림 형식: 마지막 줄이 가맹점
    merchant = lines[lines.length - 1];
  }

  if (!merchant) return null;

  return {
    amount: parseAmount(amountMatch[1]),
    merchant,
    date: parseDateMMDD(dateMatch[1], smsDate),
    payment_method: "현대카드",
  };
};
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `npx vitest run src/lib/budget/parsers/hyundai.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 4: 커밋**

```bash
git add src/lib/budget/parsers/hyundai.ts src/lib/budget/parsers/hyundai.test.ts
git commit -m "feat(phase3): 현대카드 파서 분리 + 테스트 (smsDate 기반 연도)"
```

---

## Task 4: 우리카드 파서

**Files:**
- Create: `src/lib/budget/parsers/woori.ts`
- Create: `src/lib/budget/parsers/woori.test.ts`

- [ ] **Step 1: 테스트 작성**

```ts
// src/lib/budget/parsers/woori.test.ts
import { describe, test, expect } from "vitest";
import { parseWoori } from "./woori";

const SMS_DATE = new Date("2026-04-06T23:20:00+09:00");

describe("parseWoori", () => {
  test("일시불 승인", () => {
    const text = `[일시불.승인(0157)]04/06 23:15
5,080원 / 누적:1,493,167원
쿠팡(쿠페이)`;
    expect(parseWoori(text, SMS_DATE)).toEqual({
      amount: 5080,
      merchant: "쿠팡(쿠페이)",
      date: "2026-04-06",
      payment_method: "우리카드",
    });
  });

  test("우리카드/일시불.승인 키워드 없으면 null", () => {
    expect(parseWoori("현대카드MM 승인\n9,712원\n04/07 15:29\n교보문고", SMS_DATE)).toBeNull();
  });
});
```

Run: `npx vitest run src/lib/budget/parsers/woori.test.ts`
Expected: FAIL

- [ ] **Step 2: 구현**

```ts
// src/lib/budget/parsers/woori.ts
import type { ParseFn } from "./types";
import { parseAmount, parseDateMMDD } from "./utils";

export const parseWoori: ParseFn = (text, smsDate) => {
  if (!text.includes("일시불.승인") && !text.includes("우리카드")) return null;

  const dateMatch = text.match(/\](\d{2}\/\d{2})\s+\d{2}:\d{2}/);
  const amountMatch = text.match(/([\d,]+)원\s*\//);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const merchant = lines[lines.length - 1];

  if (!amountMatch || !dateMatch || !merchant) return null;

  return {
    amount: parseAmount(amountMatch[1]),
    merchant,
    date: parseDateMMDD(dateMatch[1], smsDate),
    payment_method: "우리카드",
  };
};
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `npx vitest run src/lib/budget/parsers/woori.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 4: 커밋**

```bash
git add src/lib/budget/parsers/woori.ts src/lib/budget/parsers/woori.test.ts
git commit -m "feat(phase3): 우리카드 파서 분리 + 테스트"
```

---

## Task 5: Parser 라우터

**Files:**
- Create: `src/lib/budget/parsers/index.ts`
- Create: `src/lib/budget/parsers/index.test.ts`

- [ ] **Step 1: 테스트 작성**

```ts
// src/lib/budget/parsers/index.test.ts
import { describe, test, expect } from "vitest";
import { parse } from "./index";

const SMS_DATE = new Date("2026-04-07T15:30:00+09:00");

describe("parse", () => {
  test("현대카드 라우팅", () => {
    const text = `함다영 님, 현대카드MM 승인
1,000원 일시불, 4/7 14:00
스타벅스`;
    const result = parse(text, SMS_DATE);
    expect(result?.payment_method).toBe("현대카드");
    expect(result?.merchant).toBe("스타벅스");
  });

  test("우리카드 라우팅", () => {
    const text = `[일시불.승인(0157)]04/07 14:00
2,000원 / 누적:0원
쿠팡`;
    const result = parse(text, SMS_DATE);
    expect(result?.payment_method).toBe("우리카드");
  });

  test("미지원 형식 → null", () => {
    expect(parse("일반 광고문자", SMS_DATE)).toBeNull();
  });
});
```

Run: `npx vitest run src/lib/budget/parsers/index.test.ts`
Expected: FAIL

- [ ] **Step 2: 구현**

```ts
// src/lib/budget/parsers/index.ts
import type { Parsed, ParseFn } from "./types";
import { parseHyundai } from "./hyundai";
import { parseWoori } from "./woori";

const parsers: ParseFn[] = [parseHyundai, parseWoori];

/**
 * 모든 파서를 순서대로 시도. 첫 매칭 결과 반환. 모두 null이면 null.
 * 새 카드 추가 시: src/lib/budget/parsers/<카드>.ts 작성 + 위 배열에 추가.
 */
export function parse(text: string, smsDate: Date): Parsed | null {
  for (const fn of parsers) {
    const result = fn(text, smsDate);
    if (result) return result;
  }
  return null;
}

export type { Parsed };
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `npx vitest run src/lib/budget/parsers/`
Expected: PASS (전체 parser 테스트 11개 통과)

- [ ] **Step 4: 커밋**

```bash
git add src/lib/budget/parsers/index.ts src/lib/budget/parsers/index.test.ts
git commit -m "feat(phase3): parser 라우터 (parsers 배열 + parse)"
```

---

## Task 6: Categorize 모듈 (사전 조회)

**Files:**
- Create: `src/lib/budget/categorize.ts`
- Create: `src/lib/budget/categorize.test.ts`

- [ ] **Step 1: 테스트 작성**

```ts
// src/lib/budget/categorize.test.ts
import { describe, test, expect, vi } from "vitest";
import { lookupCategory } from "./categorize";

function mockSupabase(returnValue: { data: { category: string } | null; error: null }) {
  const maybeSingle = vi.fn().mockResolvedValue(returnValue);
  const eq2 = vi.fn().mockReturnValue({ maybeSingle });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  return { from, eq1, eq2, select } as const;
}

describe("lookupCategory", () => {
  test("hit → 사전 카테고리 반환", async () => {
    const sb = mockSupabase({ data: { category: "카페" }, error: null });
    const result = await lookupCategory({ from: sb.from } as never, "u1", "스타벅스");
    expect(result).toBe("카페");
    expect(sb.from).toHaveBeenCalledWith("merchant_category_map");
  });

  test("miss → '미분류' 반환", async () => {
    const sb = mockSupabase({ data: null, error: null });
    const result = await lookupCategory({ from: sb.from } as never, "u1", "신규가맹점");
    expect(result).toBe("미분류");
  });
});
```

Run: `npx vitest run src/lib/budget/categorize.test.ts`
Expected: FAIL

- [ ] **Step 2: 구현**

```ts
// src/lib/budget/categorize.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * merchant_category_map에서 (user_id, merchant) 조회.
 * 히트 시 저장된 카테고리, 미스 시 "미분류".
 */
export async function lookupCategory(
  supabase: SupabaseClient,
  userId: string,
  merchant: string
): Promise<string> {
  const { data } = await supabase
    .from("merchant_category_map")
    .select("category")
    .eq("user_id", userId)
    .eq("merchant", merchant)
    .maybeSingle();

  return (data as { category: string } | null)?.category ?? "미분류";
}
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `npx vitest run src/lib/budget/categorize.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 4: 커밋**

```bash
git add src/lib/budget/categorize.ts src/lib/budget/categorize.test.ts
git commit -m "feat(phase3): merchant_category_map 사전 조회 모듈"
```

---

## Task 7: Rate Limit (checkBudgetSmsLimit)

**Files:**
- Modify: `src/lib/rateLimit/upstash.ts`
- Modify: `src/lib/rateLimit/upstash.test.ts` (기존 테스트 깨지지 않게 + 신규 함수 테스트)

- [ ] **Step 1: upstash.ts 현재 구조 확인**

```bash
cat src/lib/rateLimit/upstash.ts
```

- [ ] **Step 2: 신규 limiter 추가 + 함수 export**

기존 `getWindows`를 `getCollectWindows`로 rename하지 말고, 새 helper 함수 추가 (collect:global과 키 분리):

`src/lib/rateLimit/upstash.ts` 끝에 추가:

```ts
const BUDGET_SMS_KEY = "budget-sms:global";

type BudgetWindow = { minute: Ratelimit; day: Ratelimit };
let budgetCached: BudgetWindow | null = null;

function getBudgetWindows(): BudgetWindow | null {
  if (budgetCached !== null) return budgetCached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    budgetCached = null;
    return null;
  }
  const redis = new Redis({ url, token });
  const minute = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, "1 m"), prefix: "budget-sms-m" });
  const day = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(500, "1 d"), prefix: "budget-sms-d" });
  budgetCached = { minute, day };
  return budgetCached;
}

export async function checkBudgetSmsLimit(): Promise<CollectLimitResult> {
  const w = getBudgetWindows();
  if (!w) return { ok: true };

  const [m, d] = await Promise.all([w.minute.limit(BUDGET_SMS_KEY), w.day.limit(BUDGET_SMS_KEY)]);
  if (!m.success || !d.success) {
    const reset = Math.max(m.success ? 0 : m.reset, d.success ? 0 : d.reset);
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return { ok: false, retryAfter };
  }
  return { ok: true };
}
```

- [ ] **Step 3: 테스트 추가 (env 미설정 → fail-open만 확인)**

`src/lib/rateLimit/upstash.test.ts`에 추가:

```ts
import { checkBudgetSmsLimit } from "./upstash";

describe("checkBudgetSmsLimit", () => {
  test("env 미설정 시 fail-open", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const result = await checkBudgetSmsLimit();
    expect(result).toEqual({ ok: true });
  });
});
```

(실제 Redis 동작 테스트는 Phase 0 패턴과 동일하게 통합 환경에서만 — 단위 테스트는 fail-open 경로만 검증)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/rateLimit/upstash.test.ts`
Expected: PASS (기존 + 신규 모두)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/rateLimit/upstash.ts src/lib/rateLimit/upstash.test.ts
git commit -m "feat(phase3): Upstash budget-sms:global rate limit (30/min + 500/day)"
```

---

## Task 8: `/api/budget/auto` 라우트 재작성

**Files:**
- Modify: `src/app/api/budget/auto/route.ts`
- Modify: `src/app/api/budget/auto/route.test.ts` (없으면 신규 생성)

- [ ] **Step 1: 기존 라우트 테스트 파일 확인**

```bash
ls src/app/api/budget/auto/
```

테스트가 없으면 신규 생성. 있으면 보강.

- [ ] **Step 2: 테스트 작성**

```ts
// src/app/api/budget/auto/route.test.ts
import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock, requireBearerMock, checkLimitMock, parseMock, lookupMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  requireBearerMock: vi.fn(),
  checkLimitMock: vi.fn(),
  parseMock: vi.fn(),
  lookupMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: fromMock }),
}));
vi.mock("@/lib/auth/requireBearer", () => ({
  requireBearer: requireBearerMock,
}));
vi.mock("@/lib/rateLimit/upstash", () => ({
  checkBudgetSmsLimit: checkLimitMock,
}));
vi.mock("@/lib/budget/parsers", () => ({
  parse: parseMock,
}));
vi.mock("@/lib/budget/categorize", () => ({
  lookupCategory: lookupMock,
}));

import { POST } from "./route";

function makeReq(body: unknown, auth = "Bearer correct") {
  return new Request("http://localhost/api/budget/auto", {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BUDGET_SMS_SECRET = "correct";
  process.env.DEFAULT_USER_ID = "u1";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "srv";
  requireBearerMock.mockReturnValue({ ok: true });
  checkLimitMock.mockResolvedValue({ ok: true });
});

describe("/api/budget/auto", () => {
  test("secret 누락 → 401", async () => {
    requireBearerMock.mockReturnValue({ ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) });
    const res = await POST(makeReq({ raw_text: "..." }, "Bearer wrong"));
    expect(res.status).toBe(401);
  });

  test("raw_text 4KB 초과 → 400", async () => {
    const big = "x".repeat(4097);
    const res = await POST(makeReq({ raw_text: big }));
    expect(res.status).toBe(400);
  });

  test("rate limit 초과 → 429", async () => {
    checkLimitMock.mockResolvedValue({ ok: false, retryAfter: 30 });
    const res = await POST(makeReq({ raw_text: "현대카드 1000원" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
  });

  test("파싱 실패 → 422", async () => {
    parseMock.mockReturnValue(null);
    const res = await POST(makeReq({ raw_text: "지원 안 하는 형식" }));
    expect(res.status).toBe(422);
  });

  test("정상 + 사전 미스 → 201, 미분류 INSERT", async () => {
    parseMock.mockReturnValue({ amount: 1000, merchant: "신규", date: "2026-04-27", payment_method: "현대카드" });
    lookupMock.mockResolvedValue("미분류");
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: "e1" }, error: null }) }),
    });
    fromMock.mockReturnValue({ insert: insertMock });

    const res = await POST(makeReq({ raw_text: "현대카드 1000원" }));
    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "u1",
      amount: 1000,
      memo: "신규",
      category: "미분류",
      payment_method: "현대카드",
      date: "2026-04-27",
      type: "expense",
    }));
  });

  test("정상 + 사전 히트 → 201, 분류 적용", async () => {
    parseMock.mockReturnValue({ amount: 5000, merchant: "스타벅스", date: "2026-04-27", payment_method: "현대카드" });
    lookupMock.mockResolvedValue("카페");
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: "e1" }, error: null }) }),
    });
    fromMock.mockReturnValue({ insert: insertMock });

    await POST(makeReq({ raw_text: "현대카드 5000원" }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ category: "카페" }));
  });

  test("UNIQUE 충돌 → 409", async () => {
    parseMock.mockReturnValue({ amount: 1000, merchant: "x", date: "2026-04-27", payment_method: "현대카드" });
    lookupMock.mockResolvedValue("미분류");
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } }) }),
    });
    fromMock.mockReturnValue({ insert: insertMock });

    const res = await POST(makeReq({ raw_text: "현대카드 1000원" }));
    expect(res.status).toBe(409);
  });
});
```

Run: `npx vitest run src/app/api/budget/auto/route.test.ts`
Expected: FAIL (route.ts 아직 옛 구현)

- [ ] **Step 3: 라우트 재작성**

```ts
// src/app/api/budget/auto/route.ts
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
  const userId = process.env.DEFAULT_USER_ID!;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const category = await lookupCategory(supabase, userId, parsed.merchant);

  const { data, error } = await supabase
    .from("budget_entries")
    .insert({
      user_id: userId,
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/app/api/budget/auto/route.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/budget/auto/route.ts src/app/api/budget/auto/route.test.ts
git commit -m "feat(phase3): /api/budget/auto 재작성 (인증+rate limit+사전+UNIQUE)"
```

---

## Task 9: `updateBudgetEntry` 보강 (자동 학습 + 일괄 업데이트)

**Files:**
- Modify: `src/app/(main)/budget/actions.ts`
- Modify: `src/app/(main)/budget/actions.test.ts`

설계: spec의 "updateCategory 별도 액션"은 코드 확인 결과 더 단순한 패턴으로 통합. 기존 `updateBudgetEntry`에 다음 로직 추가:
1. update 직전 entry의 현재 category를 조회 (`select category, memo`)
2. update 수행
3. **이전 카테고리 == "미분류" AND 새 카테고리 != "미분류"**일 때만:
   - `merchant_category_map` upsert (`user_id`, `merchant=memo`, `category=newCategory`)
   - 같은 user + 같은 memo + `category="미분류"`인 다른 entries 일괄 update

학습/일괄 update 실패는 console.error만 — entry 본인 update는 성공 보장 (idempotent: 다음에 다시 분류해도 같은 결과).

- [ ] **Step 1: 테스트 추가**

`src/app/(main)/budget/actions.test.ts`에 추가:

```ts
import { updateBudgetEntry } from "./actions";

describe("updateBudgetEntry — 학습 트리거", () => {
  // 헬퍼: from 호출별 응답 매핑
  function setupSupabase(opts: {
    selectCurrent: { category: string; memo: string };
    bulkUpdated?: number;
  }) {
    // 1) select(category, memo) — 현재 entry 조회
    const currentSelect = vi.fn().mockReturnValue({
      eq: () => ({ single: () => Promise.resolve({ data: opts.selectCurrent, error: null }) }),
    });
    // 2) update — entry 본인
    const update1 = vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) });
    // 3) upsert — merchant_category_map
    const upsert = vi.fn().mockReturnValue(Promise.resolve({ error: null }));
    // 4) update — 같은 merchant 미분류 일괄
    const update2 = vi.fn().mockReturnValue({
      eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null, count: opts.bulkUpdated ?? 0 }) }) }),
    });

    let n = 0;
    fromMock.mockImplementation((table: string) => {
      n += 1;
      if (table === "budget_entries" && n === 1) return { select: currentSelect };
      if (table === "budget_entries" && n === 2) return { update: update1 };
      if (table === "merchant_category_map") return { upsert };
      if (table === "budget_entries") return { update: update2 };
      throw new Error("unexpected from()");
    });

    return { upsert, update2 };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    authed();
  });

  test("미분류 → 카테고리 변경 시 사전 upsert + 일괄 update 트리거", async () => {
    const { upsert, update2 } = setupSupabase({ selectCurrent: { category: "미분류", memo: "스타벅스" } });

    const result = await updateBudgetEntry("e1", {
      date: "2026-04-27", category: "카페", description: "", memo: "스타벅스",
      amount: 5000, paymentMethod: "현대카드",
    });

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      merchant: "스타벅스",
      category: "카페",
    }), expect.objectContaining({ onConflict: "user_id,merchant" }));
    expect(update2).toHaveBeenCalled();
  });

  test("이미 분류된 entry → 사전/일괄 update 호출 안 함", async () => {
    const { upsert, update2 } = setupSupabase({ selectCurrent: { category: "식사", memo: "x" } });

    await updateBudgetEntry("e1", {
      date: "2026-04-27", category: "카페", description: "", memo: "x",
      amount: 1000, paymentMethod: "현대카드",
    });

    expect(upsert).not.toHaveBeenCalled();
    expect(update2).not.toHaveBeenCalled();
  });

  test("미분류 → 미분류 (변화 없음) → 학습 안 함", async () => {
    const { upsert, update2 } = setupSupabase({ selectCurrent: { category: "미분류", memo: "x" } });

    await updateBudgetEntry("e1", {
      date: "2026-04-27", category: "미분류" as never, description: "", memo: "x",
      amount: 1000, paymentMethod: "현대카드",
    });

    expect(upsert).not.toHaveBeenCalled();
    expect(update2).not.toHaveBeenCalled();
  });

  test("학습/일괄 update 실패해도 entry 본인 update는 성공", async () => {
    // 1) select OK 2) update OK 3) upsert FAIL → 그 후 단계는 호출되지만 무시
    const currentSelect = vi.fn().mockReturnValue({
      eq: () => ({ single: () => Promise.resolve({ data: { category: "미분류", memo: "x" }, error: null }) }),
    });
    const update1 = vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) });
    const upsert = vi.fn().mockReturnValue(Promise.resolve({ error: { message: "boom" } }));
    let n = 0;
    fromMock.mockImplementation((table: string) => {
      n += 1;
      if (n === 1) return { select: currentSelect };
      if (n === 2) return { update: update1 };
      if (table === "merchant_category_map") return { upsert };
      return { update: vi.fn().mockReturnValue({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({}) }) }) }) };
    });

    const result = await updateBudgetEntry("e1", {
      date: "2026-04-27", category: "카페", description: "", memo: "x",
      amount: 1000, paymentMethod: "현대카드",
    });

    expect(result).toEqual({ ok: true });
  });
});
```

Run: `npx vitest run src/app/\(main\)/budget/actions.test.ts`
Expected: FAIL

- [ ] **Step 2: `updateBudgetEntry` 보강**

`src/app/(main)/budget/actions.ts`의 `updateBudgetEntry` 교체:

```ts
export async function updateBudgetEntry(id: string, input: EntryInput): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof id !== "string" || id.length === 0) return { ok: false, error: "잘못된 id" };

  const v = validateEntry(input);
  if (!v.ok) return v;

  try {
    const supabase = await createClient();
    const userId = session.user.id;

    // 1) 현재 카테고리 조회 (학습 트리거 판정용)
    const { data: current, error: selErr } = await supabase
      .from("budget_entries")
      .select("category, memo")
      .eq("id", id)
      .single();
    if (selErr || !current) return { ok: false, error: "Not found" };

    const prevCategory = (current as { category: string }).category;

    // 2) entry 본인 update
    const { error: updErr } = await supabase
      .from("budget_entries")
      .update({
        date: input.date,
        category: input.category,
        description: input.description || null,
        memo: input.memo || null,
        amount: input.amount,
        payment_method: normalizePayment(input.category, input.paymentMethod),
        type: entryType(input.category),
      })
      .eq("id", id);

    if (updErr) return { ok: false, error: "Update failed" };

    // 3) 학습 트리거: 미분류 → 다른 카테고리로 변경된 경우만
    const shouldLearn =
      prevCategory === "미분류" &&
      input.category !== "미분류" &&
      typeof input.memo === "string" &&
      input.memo.length > 0;

    if (shouldLearn) {
      // 3-1) 사전 upsert
      const { error: upsertErr } = await supabase
        .from("merchant_category_map")
        .upsert(
          { user_id: userId, merchant: input.memo, category: input.category },
          { onConflict: "user_id,merchant" }
        );
      if (upsertErr) {
        console.error("merchant_category_map upsert:", upsertErr.message);
      }

      // 3-2) 같은 merchant + 미분류 entries 일괄 update
      const { error: bulkErr } = await supabase
        .from("budget_entries")
        .update({ category: input.category, type: entryType(input.category) })
        .eq("user_id", userId)
        .eq("memo", input.memo)
        .eq("category", "미분류");
      if (bulkErr) {
        console.error("budget bulk update:", bulkErr.message);
      }
    }

    revalidatePath("/budget");
    revalidatePath("/home");
    return { ok: true };
  } catch (err) {
    console.error("updateBudgetEntry:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Update failed" };
  }
}
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `npx vitest run src/app/\(main\)/budget/actions.test.ts`
Expected: PASS (기존 + 신규 4 = 전체)

- [ ] **Step 4: 커밋**

```bash
git add src/app/\(main\)/budget/actions.ts src/app/\(main\)/budget/actions.test.ts
git commit -m "feat(phase3): updateBudgetEntry — 미분류 분류 시 자동 학습 + 일괄 업데이트"
```

---

## Task 10: 맥미니 측 — `poll.sh`

**Files:**
- Create: `~/Library/Application Support/budget-sms/poll.sh`

위치 결정: `~/Library/Application Support/budget-sms/`. macOS Time Machine 기본 백업 제외 경로 (`Application Support` 자체는 백업되지만, secret.env는 별도 `tmutil addexclusion`으로 제외).

- [ ] **Step 1: 디렉터리 생성**

```bash
mkdir -p "$HOME/Library/Application Support/budget-sms"
```

- [ ] **Step 2: `poll.sh` 작성**

```bash
cat > "$HOME/Library/Application Support/budget-sms/poll.sh" << 'EOF'
#!/usr/bin/env bash
# budget-sms poll: chat.db에서 신규 결제 SMS를 잡아 Vercel API에 POST.
# launchd가 30초마다 실행. 출력은 stdout/stderr에 → launchd log.

set -euo pipefail

DIR="$HOME/Library/Application Support/budget-sms"
STATE="$DIR/state.txt"
SECRET_FILE="$DIR/secret.env"
FAILED_PARSES_LOG="$DIR/failed-parses.log"
FAILED_NETWORK_LOG="$DIR/failed-network.log"
RETRY_COUNT_FILE="$DIR/retry-count.txt"

API_URL="${BUDGET_SMS_API_URL:-https://daniel-personal-app.vercel.app/api/budget/auto}"
CHAT_DB="$HOME/Library/Messages/chat.db"

# secret 읽기
if [ ! -f "$SECRET_FILE" ]; then
  echo "[budget-sms] secret.env 없음 → setup.sh 먼저 실행" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$SECRET_FILE"
if [ -z "${BUDGET_SMS_SECRET:-}" ]; then
  echo "[budget-sms] BUDGET_SMS_SECRET 비어있음" >&2
  exit 1
fi

# state 읽기
LAST_ROWID=0
if [ -f "$STATE" ]; then
  LAST_ROWID=$(cat "$STATE")
fi

# 결제 SMS 후보 조회 (본문에 '승인' AND '원')
# text 내 newline/CR을 literal \n / 빈 문자로 치환 — IFS='|' read가 깨지지 않게.
# bash에서 printf '%b'로 \n을 실제 개행으로 복원.
ROWS=$(sqlite3 -readonly "$CHAT_DB" \
  "SELECT ROWID, date,
          REPLACE(REPLACE(COALESCE(text, ''), char(13), ''), char(10), '\\n')
     FROM message
    WHERE ROWID > $LAST_ROWID
      AND text IS NOT NULL
      AND text LIKE '%승인%'
      AND text LIKE '%원%'
    ORDER BY ROWID ASC
    LIMIT 50;" 2>/dev/null) || {
  echo "[budget-sms] sqlite3 실패 (chat.db 락 또는 권한 부족)" >&2
  exit 0  # 다음 폴링에서 재시도
}

if [ -z "$ROWS" ]; then
  exit 0
fi

# 행마다 처리: ROWID|date|text
echo "$ROWS" | while IFS='|' read -r rowid msg_date_ns rest; do
  # rest는 text. 줄바꿈이 sqlite3에서 \n으로 들어옴 → printf로 복원
  text=$(printf '%b' "$rest")

  # Apple epoch (2001-01-01 UTC) ns → ms (Unix epoch)
  # 2001-01-01 = 978307200 (sec since 1970)
  sms_date_ms=$(( (msg_date_ns / 1000000) + 978307200000 ))

  # POST
  http_code=$(curl -sS -o /tmp/budget-sms-resp.txt -w "%{http_code}" \
    -X POST "$API_URL" \
    -H "Authorization: Bearer $BUDGET_SMS_SECRET" \
    -H "Content-Type: application/json" \
    --data "$(jq -n --arg t "$text" --argjson d "$sms_date_ms" '{raw_text:$t, sms_date_ms:$d}')" \
    --max-time 10 || echo "000")

  case "$http_code" in
    201|409)
      # 정상 (신규 또는 이미 처리됨) → state 갱신
      echo "$rowid" > "$STATE"
      rm -f "$RETRY_COUNT_FILE"
      ;;
    422)
      # 파싱 실패 → 로그 + state 갱신 (재시도 의미 없음)
      {
        echo "=== $(date -Iseconds) | rowid=$rowid ==="
        echo "$text"
        echo
      } >> "$FAILED_PARSES_LOG"
      chmod 600 "$FAILED_PARSES_LOG"
      echo "$rowid" > "$STATE"
      ;;
    400)
      # 잘못된 입력 (4KB 초과 등) → 로그 + state 갱신
      {
        echo "=== $(date -Iseconds) | rowid=$rowid | 400 bad request ==="
        echo "${text:0:200}..."
        echo
      } >> "$FAILED_PARSES_LOG"
      chmod 600 "$FAILED_PARSES_LOG"
      echo "$rowid" > "$STATE"
      ;;
    401)
      # 인증 실패 → 즉시 중단 + 알림
      osascript -e 'display notification "BUDGET_SMS_SECRET 인증 실패 — secret 확인 필요" with title "budget-sms"' || true
      echo "[budget-sms] 401 — 중단" >&2
      exit 1
      ;;
    429)
      # rate limit → retry-after 따라 sleep, state 진행 안 함
      retry=$(grep -i 'retry-after' /tmp/budget-sms-resp.txt | awk '{print $2}' | tr -d '\r' || echo 60)
      sleep "${retry:-60}" || true
      # 다음 폴링에서 재시도
      ;;
    000|5*)
      # 네트워크 또는 서버 오류 → state 진행 안 함, 재시도 카운터 증가
      cnt=$(cat "$RETRY_COUNT_FILE" 2>/dev/null || echo 0)
      cnt=$((cnt + 1))
      if [ "$cnt" -ge 3 ]; then
        {
          echo "=== $(date -Iseconds) | rowid=$rowid | http=$http_code (3회 실패 skip) ==="
          echo "${text:0:200}..."
          echo
        } >> "$FAILED_NETWORK_LOG"
        chmod 600 "$FAILED_NETWORK_LOG"
        echo "$rowid" > "$STATE"
        rm -f "$RETRY_COUNT_FILE"
      else
        echo "$cnt" > "$RETRY_COUNT_FILE"
      fi
      ;;
    *)
      echo "[budget-sms] 예상 못 한 응답 코드: $http_code" >&2
      ;;
  esac

  # 로그 회전 (100KB 초과 시)
  for log in "$FAILED_PARSES_LOG" "$FAILED_NETWORK_LOG"; do
    if [ -f "$log" ] && [ "$(stat -f%z "$log")" -gt 102400 ]; then
      # *.1 ~ *.5 까지만 보존
      [ -f "$log.4" ] && mv "$log.4" "$log.5"
      [ -f "$log.3" ] && mv "$log.3" "$log.4"
      [ -f "$log.2" ] && mv "$log.2" "$log.3"
      [ -f "$log.1" ] && mv "$log.1" "$log.2"
      mv "$log" "$log.1"
      touch "$log"
      chmod 600 "$log"
    fi
  done
done
EOF
chmod 700 "$HOME/Library/Application Support/budget-sms/poll.sh"
```

- [ ] **Step 3: 수동 검증 (사용자 환경에서)**

Full Disk Access 부여 후:

```bash
# 1) state 초기화 (현재 chat.db 최대 ROWID로 — 과거 메시지 폭탄 방지)
sqlite3 -readonly "$HOME/Library/Messages/chat.db" "SELECT MAX(ROWID) FROM message;" \
  > "$HOME/Library/Application Support/budget-sms/state.txt"

# 2) secret.env 작성
cat > "$HOME/Library/Application Support/budget-sms/secret.env" << ENV
export BUDGET_SMS_SECRET="<vercel 환경변수와 동일 값>"
ENV
chmod 600 "$HOME/Library/Application Support/budget-sms/secret.env"

# 3) Time Machine 백업 제외
tmutil addexclusion "$HOME/Library/Application Support/budget-sms/secret.env"

# 4) 수동 실행
"$HOME/Library/Application Support/budget-sms/poll.sh"

# 5) state.txt 갱신됐는지 확인 + (테스트 결제 후) 가계부 페이지에서 entry 확인
```

- [ ] **Step 4: 커밋 (스크립트는 git 추적 외부지만, 레포에 사본 두기)**

레포 경로 `scripts/mac/budget-sms/poll.sh`로 사본을 두고 README에 "이 파일을 `~/Library/Application Support/budget-sms/`로 복사" 안내. (사용자 home의 실제 파일은 git이 추적하지 않음.)

```bash
mkdir -p scripts/mac/budget-sms
cp "$HOME/Library/Application Support/budget-sms/poll.sh" scripts/mac/budget-sms/poll.sh
git add scripts/mac/budget-sms/poll.sh
git commit -m "feat(phase3): 맥미니용 poll.sh (chat.db 폴링 + curl POST)"
```

---

## Task 11: 맥미니 측 — `setup.sh` + launchd plist

**Files:**
- Create: `scripts/mac/budget-sms/setup.sh`
- Create: `scripts/mac/budget-sms/com.daniel.budget-sms.plist`

- [ ] **Step 1: setup.sh 작성**

```bash
cat > scripts/mac/budget-sms/setup.sh << 'EOF'
#!/usr/bin/env bash
# budget-sms 초기 설치 / 재설치 스크립트.
# 사용: bash setup.sh
set -euo pipefail

DIR="$HOME/Library/Application Support/budget-sms"
PLIST_SRC="$(dirname "$0")/com.daniel.budget-sms.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.daniel.budget-sms.plist"

mkdir -p "$DIR"

# 0) 의존성 체크
for cmd in sqlite3 curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[setup] '$cmd' 명령이 없습니다. 'brew install $cmd'로 설치 후 재실행." >&2
    exit 1
  fi
done

# 1) Full Disk Access 안내
cat <<MSG

=== budget-sms 설치 ===

이 스크립트는 다음을 합니다:
  1) ~/Library/Application Support/budget-sms/ 디렉터리 준비
  2) launchd plist 설치 + 로드 (30초 주기로 poll.sh 실행)
  3) state.txt 초기화 (현재 chat.db 최대 ROWID = 과거 메시지 무시)
  4) secret.env 템플릿 생성
  5) Time Machine 백업 제외 등록

** 시작 전 필요한 것 **
  - System Settings → Privacy & Security → Full Disk Access 에서
    /bin/sh, /usr/bin/sqlite3, 그리고 사용 중인 터미널 앱(또는 launchd)에 권한 부여.
  - Vercel 대시보드에서 BUDGET_SMS_SECRET, DEFAULT_USER_ID, SUPABASE_SERVICE_ROLE_KEY 환경변수 등록.

계속하려면 Enter, 중단하려면 Ctrl+C.
MSG
read -r _

# 2) poll.sh 복사 (있으면 갱신)
cp "$(dirname "$0")/poll.sh" "$DIR/poll.sh"
chmod 700 "$DIR/poll.sh"

# 3) state.txt 초기화 (최초 1회만)
if [ ! -f "$DIR/state.txt" ]; then
  MAX_ROWID=$(sqlite3 -readonly "$HOME/Library/Messages/chat.db" "SELECT COALESCE(MAX(ROWID), 0) FROM message;" 2>/dev/null || echo 0)
  echo "$MAX_ROWID" > "$DIR/state.txt"
  echo "[setup] state.txt 초기화: $MAX_ROWID"
fi

# 4) secret.env 템플릿 (있으면 건너뜀)
if [ ! -f "$DIR/secret.env" ]; then
  cat > "$DIR/secret.env" << ENV
# budget-sms secret. mode 600. Time Machine 제외됨.
# Vercel 환경변수 BUDGET_SMS_SECRET와 동일한 값으로 채울 것.
export BUDGET_SMS_SECRET=""
# (선택) API URL override
# export BUDGET_SMS_API_URL="https://daniel-personal-app.vercel.app/api/budget/auto"
ENV
  chmod 600 "$DIR/secret.env"
  echo "[setup] secret.env 템플릿 생성됨 — 값 채울 것: $DIR/secret.env"
fi

# 5) Time Machine 제외
tmutil addexclusion "$DIR/secret.env" 2>/dev/null || true

# 6) plist 설치
mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__HOME__|$HOME|g" "$PLIST_SRC" > "$PLIST_DST"
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"
echo "[setup] launchd agent 등록 완료: $PLIST_DST"

cat <<DONE

=== 완료 ===
  - secret.env에 BUDGET_SMS_SECRET 값을 채우세요: $DIR/secret.env
  - 30초 후 자동 첫 폴링.
  - 수동 실행: bash "$DIR/poll.sh"
  - 로그 확인: log stream --predicate 'process == "poll.sh"' --info
DONE
EOF
chmod +x scripts/mac/budget-sms/setup.sh
```

- [ ] **Step 2: plist 작성**

```bash
cat > scripts/mac/budget-sms/com.daniel.budget-sms.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.daniel.budget-sms</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>__HOME__/Library/Application Support/budget-sms/poll.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>30</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>__HOME__/Library/Application Support/budget-sms/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>__HOME__/Library/Application Support/budget-sms/stderr.log</string>
</dict>
</plist>
EOF
```

(`__HOME__`은 setup.sh에서 sed로 치환)

- [ ] **Step 3: 사용자가 setup.sh 실행 (수동 검증)**

```bash
bash scripts/mac/budget-sms/setup.sh
# secret.env 채우기
# 30초 대기 후 stdout.log/stderr.log 확인
launchctl list | grep budget-sms
```

- [ ] **Step 4: 커밋**

```bash
git add scripts/mac/budget-sms/setup.sh scripts/mac/budget-sms/com.daniel.budget-sms.plist
git commit -m "feat(phase3): 맥미니 setup.sh + launchd plist (30초 주기)"
```

---

## Task 12: 운영 문서 (`budget-sms-runbook.md`)

**Files:**
- Create: `docs/operations/budget-sms-runbook.md`

- [ ] **Step 1: 작성**

```markdown
# budget-sms 운영 Runbook

Phase 3에서 추가된 SMS 결제문자 자동 가계부 입력 라인의 운영 가이드.

## 구성

- **맥미니**: `~/Library/Application Support/budget-sms/`에 launchd agent + poll.sh가 30초 주기로 chat.db를 SELECT.
- **Vercel**: `/api/budget/auto`가 인증 + rate limit + 카드 파서 + 사전 조회 후 INSERT.
- **Supabase**: `budget_entries` (UNIQUE 중복 방지), `merchant_category_map` (사전).

## 환경변수

### Vercel

| 키 | 용도 |
|---|---|
| `BUDGET_SMS_SECRET` | 256bit 랜덤. 맥미니의 `secret.env`와 동일 |
| `DEFAULT_USER_ID` | Supabase auth.users 기준 본인 uuid (이미 `/api/collect`에서 사용 중) |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 우회용. 이미 다른 endpoint에서 사용 중 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | rate limit. 누락 시 fail-open (개발 편의) |

### 맥미니

`~/Library/Application Support/budget-sms/secret.env`:

```bash
export BUDGET_SMS_SECRET="..."         # Vercel과 동일
export BUDGET_SMS_API_URL="..."        # 선택, 기본은 prod 도메인
```

## Secret 로테이션 (분기 1회 권장 / 유출 즉시)

1. 새 secret 생성: `openssl rand -hex 32`.
2. Vercel 대시보드 → Settings → Environment Variables → `BUDGET_SMS_SECRET` 값 교체 → Redeploy.
3. 맥미니 `secret.env` 갱신:
   ```bash
   nano "$HOME/Library/Application Support/budget-sms/secret.env"
   ```
4. 로테이션 동안 진입한 SMS 1~2건은 401로 실패할 수 있음. 만약 macOS 알림이 떴다면 secret.env 값과 Vercel 값이 다른 상태 → 동기화 후 다음 30초에 자동 재시도.
5. 검증: 새 결제 1건 발생 후 가계부 페이지에 entry 들어왔는지 확인.

## 새 카드 파서 추가 (예: 하나체크카드)

1. **SMS 샘플 수집**: 카드사 알림 신청 → 첫 결제 SMS 1~2건 raw 텍스트 메모.
2. **파서 작성**: `src/lib/budget/parsers/<카드>.ts` 신규.
   - 시그니처: `export const parse<카드>: ParseFn = (text, smsDate) => Parsed | null`
   - 키워드 식별 → null 빠르게 반환
   - 정규식으로 amount/date/merchant 추출
3. **단위 테스트**: `src/lib/budget/parsers/<카드>.test.ts` 픽스처 1~2개.
4. **등록**: `src/lib/budget/parsers/index.ts`의 `parsers` 배열에 import + 추가.
5. **커밋 + 배포**: PR → merge → Vercel 자동 배포.
6. **검증**: 다음 결제부터 자동 분류 흐름 시작.

## 디버깅

### "결제했는데 가계부에 안 떠요"

체크 순서:

1. `~/Library/Application Support/budget-sms/state.txt` — ROWID가 결제 SMS 도착 시점보다 큰가?
2. `stderr.log` — 에러 메시지?
3. `failed-parses.log` — 파싱 실패로 빠진 게 있나? 새 카드 형식이면 위 절차로 파서 추가.
4. `failed-network.log` — 네트워크 실패 누적?
5. 수동 호출: `bash "$HOME/Library/Application Support/budget-sms/poll.sh"`
6. Vercel logs: `/api/budget/auto`로 들어온 호출 보기.
7. Supabase: `select * from budget_entries order by created_at desc limit 5;`

### "401 에러 macOS 알림이 자꾸 떠요"

= secret 불일치. Vercel 값과 secret.env 값을 다시 비교.

### "rate limit 자꾸 걸려요"

`@upstash` 대시보드에서 `budget-sms-m:budget-sms:global` 키 확인. 정상 사용에선 분당 30건 도달 어려움. 폭주는 봇 또는 chat.db 폴링 버그.

### "특정 가맹점이 자꾸 잘못된 카테고리로 들어와요"

`merchant_category_map`에 학습된 매핑이 잘못됨:

```sql
update merchant_category_map set category='카페' where merchant='스타벅스' and user_id='<your uuid>';
```

또는 사용자가 가계부 페이지에서 미분류 entry를 분류해도 됨 (자동 학습). 그러나 이미 분류된 entry를 다른 카테고리로 바꿀 때는 학습이 일어나지 **않음**(spec 의도) — SQL로 직접 수정 필요.

## 비용 모니터링 포인트

- Vercel Function Invocations (월 한도 100k): `/api/budget/auto` 호출 수.
- Supabase row 수: `budget_entries`, `merchant_category_map`.
- Upstash commands: 한도의 1% 미만이어야 정상.
```

- [ ] **Step 2: 커밋**

```bash
git add docs/operations/budget-sms-runbook.md
git commit -m "docs(phase3): budget-sms 운영 runbook (secret 로테이션, 새 카드, 디버깅)"
```

---

## Task 13: 통합 검증 + 사용자 핸드오프

**Files:** (없음 — 검증만)

- [ ] **Step 1: 전체 테스트 통과 확인**

```bash
cd /Users/daniel_home/daniel-personal-app
npx vitest run
```

Expected: 모든 테스트 PASS (parser 11개 + categorize 2개 + rateLimit + actions 학습 4개 + route 7개 = 추가 ~25개).

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공, type 오류 없음.

- [ ] **Step 3: 사용자가 수동 진행할 절차 정리**

PR 머지 시점에 사용자에게 이 순서로 안내:

1. **Supabase 마이그레이션**: Dashboard → SQL Editor에서 `supabase_migration_phase3_sms.sql` 실행.
2. **Vercel 환경변수 추가**:
   - `BUDGET_SMS_SECRET` (`openssl rand -hex 32`로 생성)
3. **Vercel redeploy**.
4. **맥미니 setup**:
   ```bash
   cd /path/to/daniel-personal-app
   bash scripts/mac/budget-sms/setup.sh
   nano "$HOME/Library/Application Support/budget-sms/secret.env"   # secret 채우기
   ```
5. **Full Disk Access 권한**: System Settings → Privacy → Full Disk Access에서 `/bin/bash`, `/usr/bin/sqlite3` 추가.
6. **검증**: 30초 대기 → `state.txt` 비어있지 않은지 확인 → 다음 결제 발생 시 가계부 페이지에서 entry 확인.

- [ ] **Step 4: PR 작성 (사용자가 직접 또는 agent가)**

```bash
git push -u origin phase3-sms-budget-automation
gh pr create --title "Phase 3: SMS 결제문자 가계부 자동입력" --body "..."
```

PR body는 spec/plan 링크 + 위 수동 절차 6단계 포함.

---

## Self-Review Notes (본 plan 작성 후 점검)

- ✅ Spec의 결정사항 1~14번 모두 task로 매핑됨.
- ✅ 오픈 이슈 #1 (시간대 변환) → Task 2 (`parseDateMMDD`가 smsDate 인자 받음) + Task 8 (`sms_date_ms`를 body에 받음) + Task 10 (poll.sh가 Apple epoch ns → ms 변환) 3단계로 해결.
- ✅ 오픈 이슈 #2 (secret.env 백업 제외) → Task 10/11에서 `~/Library/Application Support/budget-sms/` + `tmutil addexclusion`으로 해결.
- ✅ 후속 작업 (하나체크카드 파서) → runbook의 "새 카드 파서 추가" 절차로 5분 작업으로 정리됨.
- ✅ 모든 task가 TDD 패턴 (test → fail → impl → pass → commit).
- ✅ Placeholder 없음. 모든 step에 실제 코드/명령 박혀있음.
- ✅ Type 일관성: `Parsed`, `ParseFn` 타입이 Task 2에 정의되고 모든 후속 task에서 동일 이름으로 사용. `lookupCategory` 시그니처 일관.
- ⚠️ Server Action 학습 로직: spec엔 "updateCategory 별도 액션"이지만 plan에선 "updateBudgetEntry 통합". spec과 plan 사이의 이 의도적 변경은 Task 9 머리에 명시.
