# Phase 2 — 인스타 링크 자동 큐레이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/api/collect`로 들어온 인스타 링크를 Claude Haiku 4.5로 동기 요약·분류한 뒤(실패 시 1시간 cron이 회수), `/memo?tab=curation` 카테고리별 카드 리스트로 표시한다. 수동 인박스 흐름은 폐기.

**Architecture:** 단일 Next.js 16.2 + Supabase + Anthropic SDK + Upstash Ratelimit. 모든 외부 호출은 베스트-에포트(row 손실 없음). cron이 dead-letter 직전(`processing_attempts < 5`)까지 재시도. 디자인 토큰은 Phase 1.5 그대로.

**Tech Stack:** TypeScript, Next.js 16.2 (App Router, Server Actions), Supabase SSR, `@anthropic-ai/sdk@^0.87`, `@upstash/ratelimit@^2`, `@upstash/redis@^1`, vitest (vi.hoisted mock 패턴).

**Spec:** `docs/superpowers/specs/2026-04-27-phase2-curation-automation-design.md`

---

## Task 0: 의존성 + 환경 + 마이그레이션 SQL

**Files:**
- Modify: `package.json` (deps 추가)
- Modify: `.env.example`
- Create: `vercel.json`
- Create: `supabase_migration_phase2_curation.sql`

- [ ] **Step 1: 의존성 설치**

```bash
npm install @upstash/ratelimit @upstash/redis
```

확인: `cat package.json | grep upstash` → 두 패키지 모두 dependencies에 있어야 함.

- [ ] **Step 2: `.env.example` 갱신**

다음 키 추가 (이미 있으면 skip):

```
# Phase 2
CRON_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

- [ ] **Step 3: `vercel.json` 생성**

```json
{
  "crons": [
    { "path": "/api/curation/process", "schedule": "0 * * * *" }
  ]
}
```

- [ ] **Step 4: 마이그레이션 SQL 생성**

`supabase_migration_phase2_curation.sql`:

```sql
-- Phase 2: collected_items 큐레이션 칼럼 추가
-- 적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run
-- 롤백: ALTER TABLE collected_items DROP COLUMN summary, ... ; DROP INDEX collected_items_pending_idx, collected_items_curation_idx;

ALTER TABLE collected_items
  ADD COLUMN IF NOT EXISTS summary              text,
  ADD COLUMN IF NOT EXISTS category             text,
  ADD COLUMN IF NOT EXISTS og_title             text,
  ADD COLUMN IF NOT EXISTS og_description       text,
  ADD COLUMN IF NOT EXISTS og_image             text,
  ADD COLUMN IF NOT EXISTS processed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS processing_attempts  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error           text;

-- cron 큐 스캔용 (미처리 + 5회 미만 + 레거시 is_processed=true 제외)
CREATE INDEX IF NOT EXISTS collected_items_pending_idx
  ON collected_items (created_at ASC)
  WHERE processed_at IS NULL AND processing_attempts < 5 AND is_processed = false;

-- 큐레이션 탭 카테고리 필터용
CREATE INDEX IF NOT EXISTS collected_items_curation_idx
  ON collected_items (category, created_at DESC)
  WHERE processed_at IS NOT NULL;
```

이 SQL은 사용자가 Supabase Dashboard에서 실제로 실행해야 하므로, 코드 작업 중에는 콘솔 출력으로 사용자에게 알릴 것.

- [ ] **Step 5: 빌드 확인**

```bash
npm run build
```
Expected: 성공 (코드 변경 없으니 회귀 없어야 함). env 없이도 통과 확인.

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json .env.example vercel.json supabase_migration_phase2_curation.sql
git commit -m "chore(phase2): upstash 의존성 + vercel cron + 마이그레이션 SQL"
```

---

## Task 1: `src/lib/curation/categories.ts` + 테스트

**Files:**
- Create: `src/lib/curation/categories.ts`
- Create: `src/lib/curation/categories.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/curation/categories.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { CURATION_CATEGORIES, isCurationCategory } from "./categories";

describe("CURATION_CATEGORIES", () => {
  test("8개 카테고리 정의됨", () => {
    expect(CURATION_CATEGORIES).toHaveLength(8);
  });

  test("정해진 라벨 포함", () => {
    expect(CURATION_CATEGORIES).toEqual([
      "음식·카페",
      "여행",
      "패션",
      "운동",
      "인테리어",
      "영감",
      "정보·꿀팁",
      "기타",
    ]);
  });
});

describe("isCurationCategory", () => {
  test("정상 카테고리 → true", () => {
    expect(isCurationCategory("여행")).toBe(true);
  });

  test("미정의 문자열 → false", () => {
    expect(isCurationCategory("랜덤")).toBe(false);
  });

  test("non-string → false", () => {
    expect(isCurationCategory(null)).toBe(false);
    expect(isCurationCategory(undefined)).toBe(false);
    expect(isCurationCategory(123)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/lib/curation/categories.test.ts
```
Expected: FAIL — `Cannot find module './categories'`.

- [ ] **Step 3: 구현**

`src/lib/curation/categories.ts`:

```typescript
export const CURATION_CATEGORIES = [
  "음식·카페",
  "여행",
  "패션",
  "운동",
  "인테리어",
  "영감",
  "정보·꿀팁",
  "기타",
] as const;

export type CurationCategory = (typeof CURATION_CATEGORIES)[number];

export function isCurationCategory(v: unknown): v is CurationCategory {
  return typeof v === "string" && (CURATION_CATEGORIES as readonly string[]).includes(v);
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/curation/categories.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/curation/categories.ts src/lib/curation/categories.test.ts
git commit -m "feat(curation): 8개 카테고리 const + 타입 가드"
```

---

## Task 2: `src/lib/auth/requireCronSecret.ts` + 테스트

**Files:**
- Create: `src/lib/auth/requireCronSecret.ts`
- Create: `src/lib/auth/requireCronSecret.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/auth/requireCronSecret.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { requireCronSecret } from "./requireCronSecret";

const ORIG = process.env.CRON_SECRET;

describe("requireCronSecret", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "secret-abc-123";
  });
  afterEach(() => {
    process.env.CRON_SECRET = ORIG;
  });

  test("정상 Bearer → ok", () => {
    const req = new Request("http://x", {
      headers: { authorization: "Bearer secret-abc-123" },
    });
    const r = requireCronSecret(req);
    expect(r.ok).toBe(true);
  });

  test("Authorization 헤더 없음 → 401", () => {
    const req = new Request("http://x");
    const r = requireCronSecret(req);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  test("토큰 불일치 → 401", () => {
    const req = new Request("http://x", {
      headers: { authorization: "Bearer wrong" },
    });
    const r = requireCronSecret(req);
    expect(r.ok).toBe(false);
  });

  test("env 미설정 → 401", () => {
    delete process.env.CRON_SECRET;
    const req = new Request("http://x", {
      headers: { authorization: "Bearer secret-abc-123" },
    });
    const r = requireCronSecret(req);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/lib/auth/requireCronSecret.test.ts
```
Expected: FAIL — `Cannot find module './requireCronSecret'`.

- [ ] **Step 3: 구현**

`src/lib/auth/requireCronSecret.ts`:

```typescript
import { safeCompare } from "./timingSafeEqual";

export type RequireCronSecretResult =
  | { ok: true }
  | { ok: false; response: Response };

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Authorization: Bearer ${CRON_SECRET}을 timing-safe 검증한다.
 * - env 누락이면 항상 401
 * - Vercel Cron이 자동으로 Authorization 헤더에 secret을 보내도록 설정되어야 함
 */
export function requireCronSecret(request: Request): RequireCronSecretResult {
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: false, response: unauthorized() };

  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return { ok: false, response: unauthorized() };

  const token = header.slice("Bearer ".length);
  if (!safeCompare(token, expected)) return { ok: false, response: unauthorized() };

  return { ok: true };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/auth/requireCronSecret.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/auth/requireCronSecret.ts src/lib/auth/requireCronSecret.test.ts
git commit -m "feat(auth): requireCronSecret (timing-safe Bearer)"
```

---

## Task 3: `src/lib/rateLimit/upstash.ts` + 테스트

**Files:**
- Create: `src/lib/rateLimit/upstash.ts`
- Create: `src/lib/rateLimit/upstash.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/rateLimit/upstash.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";

const { hourLimitMock, dayLimitMock } = vi.hoisted(() => ({
  hourLimitMock: vi.fn(),
  dayLimitMock: vi.fn(),
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: vi.fn().mockImplementation((opts: { limiter: { window?: string } }) => ({
    limit: opts.limiter.window === "1 h" ? hourLimitMock : dayLimitMock,
  })),
  // 정적 헬퍼는 prototype 위치라 별도 mock 필요
}));
// limiter 식별을 위한 가짜 slidingWindow
vi.mock("@upstash/ratelimit", async () => {
  const real = await vi.importActual<typeof import("@upstash/ratelimit")>("@upstash/ratelimit");
  return {
    Ratelimit: vi.fn().mockImplementation((opts: { limiter: { _window: string } }) => ({
      limit: opts.limiter._window === "1 h" ? hourLimitMock : dayLimitMock,
    })),
    // slidingWindow는 객체에 식별자 심어 반환
    ...real,
  };
});
vi.mock("@upstash/redis", () => ({
  Redis: vi.fn().mockImplementation(() => ({})),
}));

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = "http://x";
  process.env.UPSTASH_REDIS_REST_TOKEN = "t";
  vi.clearAllMocks();
});

describe("checkCollectLimit", () => {
  test("둘 다 통과하면 ok", async () => {
    hourLimitMock.mockResolvedValue({ success: true, remaining: 59, reset: Date.now() + 3600_000 });
    dayLimitMock.mockResolvedValue({ success: true, remaining: 199, reset: Date.now() + 86400_000 });
    const { checkCollectLimit } = await import("./upstash");
    const r = await checkCollectLimit();
    expect(r.ok).toBe(true);
  });

  test("시간당 차단 → ok=false + retryAfter", async () => {
    const reset = Date.now() + 1500;
    hourLimitMock.mockResolvedValue({ success: false, remaining: 0, reset });
    dayLimitMock.mockResolvedValue({ success: true, remaining: 100, reset: Date.now() + 86400_000 });
    const { checkCollectLimit } = await import("./upstash");
    const r = await checkCollectLimit();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfter).toBeGreaterThanOrEqual(1);
  });

  test("일일 차단 → ok=false", async () => {
    hourLimitMock.mockResolvedValue({ success: true, remaining: 50, reset: Date.now() + 3600_000 });
    dayLimitMock.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 5000 });
    const { checkCollectLimit } = await import("./upstash");
    const r = await checkCollectLimit();
    expect(r.ok).toBe(false);
  });

  test("env 미설정 → ok=true (rate limit 없는 환경 fail-open)", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    vi.resetModules();
    const { checkCollectLimit } = await import("./upstash");
    const r = await checkCollectLimit();
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/lib/rateLimit/upstash.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`src/lib/rateLimit/upstash.ts`:

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const KEY = "collect:global";

type Window = { hour: Ratelimit; day: Ratelimit } | null;
let cached: Window | null = null;

function getWindows(): Window {
  if (cached !== null) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cached = null;
    return null;
  }
  const redis = new Redis({ url, token });
  const hour = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "1 h"), prefix: "collect-h" });
  const day = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(200, "1 d"), prefix: "collect-d" });
  cached = { hour, day };
  return cached;
}

export type CollectLimitResult =
  | { ok: true }
  | { ok: false; retryAfter: number };

/**
 * collect:global 키에 대해 hourly + daily sliding window 둘 다 검사.
 * 둘 중 하나라도 차단되면 차단. env 미설정이면 fail-open(개발 편의).
 */
export async function checkCollectLimit(): Promise<CollectLimitResult> {
  const w = getWindows();
  if (!w) return { ok: true };

  const [h, d] = await Promise.all([w.hour.limit(KEY), w.day.limit(KEY)]);
  if (!h.success || !d.success) {
    const reset = Math.max(h.success ? 0 : h.reset, d.success ? 0 : d.reset);
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return { ok: false, retryAfter };
  }
  return { ok: true };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/rateLimit/upstash.test.ts
```
Expected: PASS (4 tests).

테스트의 mock이 까다로움 — 만약 첫 시도에서 모듈 캐싱 때문에 실패하면 `vi.resetModules()`를 beforeEach에 추가하고 dynamic `await import("./upstash")`로 호출하는 구조 유지.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/rateLimit/upstash.ts src/lib/rateLimit/upstash.test.ts
git commit -m "feat(rateLimit): Upstash 60/h + 200/d on collect:global"
```

---

## Task 4: `src/lib/curation/curate.ts` + 테스트 (Anthropic + 캐시)

**Files:**
- Create: `src/lib/curation/curate.ts`
- Create: `src/lib/curation/curate.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/curation/curate.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: createMock },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "k";
});

import { curateItem } from "./curate";

describe("curateItem", () => {
  test("정상 응답 파싱", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: '{"summary":"신사동 카페 추천","category":"음식·카페"}' }],
    });
    const r = await curateItem({
      url: "https://instagram.com/p/x", memo: null,
      ogTitle: "카페", ogDescription: "맛있음",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.summary).toBe("신사동 카페 추천");
      expect(r.category).toBe("음식·카페");
    }
  });

  test("system에 cache_control 포함", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: '{"summary":"x","category":"기타"}' }],
    });
    await curateItem({ url: "https://x", memo: null, ogTitle: "", ogDescription: "" });
    const arg = createMock.mock.calls[0][0];
    expect(Array.isArray(arg.system)).toBe(true);
    expect(arg.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  test("invalid category → permanent", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: '{"summary":"x","category":"하이"}' }],
    });
    const r = await curateItem({ url: "https://x", memo: null, ogTitle: "", ogDescription: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("permanent");
  });

  test("invalid JSON → permanent", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "이상한 텍스트" }],
    });
    const r = await curateItem({ url: "https://x", memo: null, ogTitle: "", ogDescription: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("permanent");
  });

  test("summary 빈 문자열 → permanent", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: '{"summary":"","category":"여행"}' }],
    });
    const r = await curateItem({ url: "https://x", memo: null, ogTitle: "", ogDescription: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("permanent");
  });

  test("summary 200자 초과 → 자르기(success)", async () => {
    const long = "가".repeat(300);
    createMock.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ summary: long, category: "여행" }) }],
    });
    const r = await curateItem({ url: "https://x", memo: null, ogTitle: "", ogDescription: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary.length).toBe(200);
  });

  test("Anthropic 5xx → transient", async () => {
    const err: Error & { status?: number } = new Error("server");
    err.status = 503;
    createMock.mockRejectedValue(err);
    const r = await curateItem({ url: "https://x", memo: null, ogTitle: "", ogDescription: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("transient");
  });

  test("Anthropic 400 → permanent", async () => {
    const err: Error & { status?: number } = new Error("bad");
    err.status = 400;
    createMock.mockRejectedValue(err);
    const r = await curateItem({ url: "https://x", memo: null, ogTitle: "", ogDescription: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("permanent");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/lib/curation/curate.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`src/lib/curation/curate.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { CURATION_CATEGORIES, isCurationCategory, type CurationCategory } from "./categories";

const MAX_SUMMARY_LEN = 200;
const MODEL = "claude-haiku-4-5-20251001";

// Haiku 4.5의 prompt cache는 시스템 프롬프트가 충분히 길 때만 발효된다.
// 카테고리 정의 + 형식 규칙 + 풍부한 few-shot 예시로 임계 토큰을 넉넉히 넘긴다.
const SYSTEM_PROMPT = `당신은 한국어로 작성된 인스타그램 게시물 링크를 분석해서 한 줄 요약과 카테고리를 부여하는 어시스턴트다.

## 출력 형식
반드시 아래 JSON만 단일 객체로 출력. 다른 텍스트, 코드블록, 설명 금지.

{ "summary": "1~2 문장 한국어 요약 (최대 200자)", "category": "8개 중 하나" }

## 카테고리 (반드시 이 8개 중 하나)
${CURATION_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n")}

## 분류 가이드
- 음식·카페: 식당, 카페, 베이커리, 디저트, 음식 레시피, 와인바, 위스키바, 분식, 파인다이닝
- 여행: 국내외 여행지, 숙소, 호텔, 비행기, 여행 코스, 도시 가이드, 풍경 사진, 여행 팁
- 패션: 옷, 신발, 가방, 액세서리, 코디, 룩북, 브랜드, 쇼핑몰, 스타일링
- 운동: 헬스, 요가, 필라테스, 러닝, 등산, 클라이밍, 골프, 스포츠 용품, 운동 루틴, 식단
- 인테리어: 가구, 조명, 홈데코, 식물, 거실, 침실, 주방, 셀프 인테리어, 리빙 용품
- 영감: 사진, 일러스트, 디자인, 글귀, 영화 장면, 예술 작품, 무드보드, 카피
- 정보·꿀팁: 생활 팁, 앱, 서비스 추천, 할인, 이벤트, 부동산, 금융, 개발 팁, 업무 팁
- 기타: 위 7개에 명확히 안 맞는 경우만 사용 (가능한 한 위 7개에 우겨넣을 것)

## 분류 예시 (입력 → 출력)

입력: URL=https://instagram.com/p/cafe-sinsa OG_title=신사동 디저트 카페 OG_description=시그니처 휘낭시에가 유명한 곳 memo=다음에 가보기
출력: {"summary":"신사동 디저트 카페, 시그니처 휘낭시에 유명","category":"음식·카페"}

입력: URL=https://instagram.com/p/jeju-stay OG_title=제주 한 달 살기 OG_description=애월읍 독채 펜션 후기 memo=
출력: {"summary":"제주 애월읍 독채 펜션 한 달 살기 후기","category":"여행"}

입력: URL=https://instagram.com/p/look01 OG_title=가을 코디 OG_description=베이지 트렌치 + 블랙 슬랙스 memo=
출력: {"summary":"가을 베이지 트렌치 + 블랙 슬랙스 코디","category":"패션"}

입력: URL=https://instagram.com/p/yoga01 OG_title=아침 요가 루틴 10분 OG_description=초보자용 memo=
출력: {"summary":"초보자용 아침 요가 10분 루틴","category":"운동"}

입력: URL=https://instagram.com/p/livingroom OG_title=북유럽 거실 OG_description=화이트 톤 + 우드 가구 memo=참고
출력: {"summary":"북유럽 화이트 톤 + 우드 가구 거실 인테리어","category":"인테리어"}

입력: URL=https://instagram.com/p/quote01 OG_title=오늘의 글귀 OG_description=느리게 가도 괜찮다 memo=
출력: {"summary":"느리게 가도 괜찮다 — 오늘의 글귀","category":"영감"}

입력: URL=https://instagram.com/p/notion-tip OG_title=노션 단축키 모음 OG_description=업무 효율 5배 memo=업무용
출력: {"summary":"업무 효율 올려주는 노션 단축키 모음","category":"정보·꿀팁"}

입력: URL=https://instagram.com/p/hike01 OG_title=북한산 등반 코스 OG_description=초보자 추천 memo=
출력: {"summary":"북한산 초보자 추천 등반 코스","category":"운동"}

입력: URL=https://instagram.com/p/photo01 OG_title=흑백 인물 사진 OG_description=감성 포트레이트 memo=무드
출력: {"summary":"흑백 인물 감성 포트레이트 사진","category":"영감"}

입력: URL=https://instagram.com/p/lighting01 OG_title=무드등 추천 OG_description=USB 충전 무선 memo=
출력: {"summary":"USB 충전 무선 무드등 추천","category":"인테리어"}

입력: URL=https://instagram.com/p/savings OG_title=청년 적금 비교 OG_description=금리 5%대 memo=
출력: {"summary":"금리 5%대 청년 적금 비교","category":"정보·꿀팁"}

입력: URL=https://instagram.com/p/run01 OG_title=한강 러닝 코스 OG_description=10km memo=주말
출력: {"summary":"주말 한강 10km 러닝 코스","category":"운동"}

## 규칙
- summary는 한국어 한 줄, 200자 이내. 광고 문구나 해시태그 금지.
- memo가 있으면 사용자의 의도를 반영. (예: memo="아침에" → summary에 "아침" 포함)
- OG 정보가 비어 있으면 URL과 memo만 보고 추정.
- 절대 카테고리 8개 외의 값을 만들지 말 것.
- 절대 JSON 외의 텍스트(주석, 설명, 코드블록) 추가하지 말 것.`;

export type CurateInput = {
  url: string;
  memo: string | null;
  ogTitle: string;
  ogDescription: string;
};

export type CurateResult =
  | { ok: true; summary: string; category: CurationCategory }
  | { ok: false; kind: "transient" | "permanent"; error: string };

function classifyError(err: unknown): "transient" | "permanent" {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status ?? 0;
    if (status === 429 || status >= 500) return "transient";
    if (status >= 400) return "permanent";
  }
  // 네트워크 오류 등은 transient로 본다
  return "transient";
}

export async function curateItem(input: CurateInput): Promise<CurateResult> {
  const userMessage = [
    `URL=${input.url}`,
    `OG_title=${input.ogTitle || "(없음)"}`,
    `OG_description=${input.ogDescription || "(없음)"}`,
    `memo=${input.memo ?? ""}`,
  ].join(" ");

  let raw: { content: Array<{ type: string; text?: string }> };
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    raw = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    }) as { content: Array<{ type: string; text?: string }> };
  } catch (err) {
    const kind = classifyError(err);
    const msg = err instanceof Error ? err.message : "unknown";
    return { ok: false, kind, error: msg };
  }

  const text = raw.content[0]?.type === "text" ? (raw.content[0].text ?? "") : "";
  let parsed: unknown;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  } catch {
    return { ok: false, kind: "permanent", error: "invalid JSON" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, kind: "permanent", error: "invalid JSON" };
  }
  const obj = parsed as Record<string, unknown>;
  const summaryRaw = typeof obj.summary === "string" ? obj.summary.trim() : "";
  const category = obj.category;

  if (!summaryRaw) return { ok: false, kind: "permanent", error: "empty summary" };
  if (!isCurationCategory(category)) {
    return { ok: false, kind: "permanent", error: "invalid category" };
  }
  const summary = summaryRaw.length > MAX_SUMMARY_LEN ? summaryRaw.slice(0, MAX_SUMMARY_LEN) : summaryRaw;
  return { ok: true, summary, category };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/curation/curate.test.ts
```
Expected: PASS (8 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/curation/curate.ts src/lib/curation/curate.test.ts
git commit -m "feat(curation): Anthropic Haiku 4.5 + ephemeral cache + 8개 분류"
```

---

## Task 5: `src/lib/curation/process.ts` + 테스트

**Files:**
- Create: `src/lib/curation/process.ts`
- Create: `src/lib/curation/process.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/curation/process.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock, safeFetchMock, parseOGMetaMock, curateItemMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  safeFetchMock: vi.fn(),
  parseOGMetaMock: vi.fn(),
  curateItemMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: fromMock }),
}));
vi.mock("@/lib/og/safeFetch", () => ({ safeFetch: safeFetchMock }));
vi.mock("@/lib/og/parseMeta", () => ({ parseOGMeta: parseOGMetaMock }));
vi.mock("./curate", () => ({ curateItem: curateItemMock }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://x";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
});

import { processCollectedItem } from "./process";

function mockSelect(row: Record<string, unknown> | null) {
  fromMock.mockReturnValueOnce({
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
    }),
  });
}
function mockUpdate() {
  const eq = vi.fn(() => Promise.resolve({ error: null }));
  fromMock.mockReturnValueOnce({ update: vi.fn(() => ({ eq })) });
  return eq;
}

describe("processCollectedItem", () => {
  test("이미 처리됨 → skipped", async () => {
    mockSelect({ id: "i1", url: "https://x", memo: null, processed_at: "2026-04-27" });
    const r = await processCollectedItem("i1");
    expect(r).toBe("skipped");
  });

  test("row 없음 → permanent_failure", async () => {
    mockSelect(null);
    const r = await processCollectedItem("i1");
    expect(r).toBe("permanent_failure");
  });

  test("정상 흐름 → success + 모든 칼럼 갱신", async () => {
    mockSelect({ id: "i1", url: "https://x", memo: "메모", processed_at: null });
    safeFetchMock.mockResolvedValue({ status: 200, body: "<html>", finalUrl: "https://x" });
    parseOGMetaMock.mockReturnValue({ title: "T", description: "D", image: "I" });
    curateItemMock.mockResolvedValue({ ok: true, summary: "요약", category: "여행" });
    mockUpdate();
    const r = await processCollectedItem("i1");
    expect(r).toBe("success");
  });

  test("OG fetch 실패해도 빈 메타로 curate 호출", async () => {
    mockSelect({ id: "i1", url: "https://x", memo: null, processed_at: null });
    safeFetchMock.mockResolvedValue({ error: "timeout" });
    curateItemMock.mockResolvedValue({ ok: true, summary: "x", category: "기타" });
    mockUpdate();
    await processCollectedItem("i1");
    const arg = curateItemMock.mock.calls[0][0];
    expect(arg.ogTitle).toBe("");
    expect(arg.ogDescription).toBe("");
  });

  test("transient 실패 → attempts++, transient_failure", async () => {
    mockSelect({ id: "i1", url: "https://x", memo: null, processed_at: null });
    safeFetchMock.mockResolvedValue({ status: 200, body: "", finalUrl: "https://x" });
    parseOGMetaMock.mockReturnValue({ title: "", description: "", image: "" });
    curateItemMock.mockResolvedValue({ ok: false, kind: "transient", error: "503" });
    mockUpdate();
    const r = await processCollectedItem("i1");
    expect(r).toBe("transient_failure");
  });

  test("permanent 실패 → attempts++, permanent_failure", async () => {
    mockSelect({ id: "i1", url: "https://x", memo: null, processed_at: null });
    safeFetchMock.mockResolvedValue({ status: 200, body: "", finalUrl: "https://x" });
    parseOGMetaMock.mockReturnValue({ title: "", description: "", image: "" });
    curateItemMock.mockResolvedValue({ ok: false, kind: "permanent", error: "bad" });
    mockUpdate();
    const r = await processCollectedItem("i1");
    expect(r).toBe("permanent_failure");
  });

  test("성공 시 update 인자에 처리 칼럼 모두 포함", async () => {
    mockSelect({ id: "i1", url: "https://x", memo: null, processed_at: null });
    safeFetchMock.mockResolvedValue({ status: 200, body: "<html>", finalUrl: "https://x" });
    parseOGMetaMock.mockReturnValue({ title: "T", description: "D", image: "I" });
    curateItemMock.mockResolvedValue({ ok: true, summary: "요약", category: "여행" });
    const updateMock = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
    fromMock.mockReturnValueOnce({ update: updateMock });
    await processCollectedItem("i1");
    const patch = updateMock.mock.calls[0][0];
    expect(patch.summary).toBe("요약");
    expect(patch.category).toBe("여행");
    expect(patch.og_title).toBe("T");
    expect(patch.og_description).toBe("D");
    expect(patch.og_image).toBe("I");
    expect(patch.processed_at).toBeTruthy();
    expect(patch.last_error).toBeNull();
  });

  test("transient 실패 시 update 인자에 attempts++만 포함", async () => {
    mockSelect({ id: "i1", url: "https://x", memo: null, processed_at: null });
    safeFetchMock.mockResolvedValue({ status: 200, body: "", finalUrl: "https://x" });
    parseOGMetaMock.mockReturnValue({ title: "", description: "", image: "" });
    curateItemMock.mockResolvedValue({ ok: false, kind: "transient", error: "503" });
    const updateMock = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
    fromMock.mockReturnValueOnce({ update: updateMock });
    await processCollectedItem("i1");
    const patch = updateMock.mock.calls[0][0];
    expect(patch.processing_attempts).toBeDefined();
    expect(patch.last_error).toContain("transient");
    expect(patch.processed_at).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/lib/curation/process.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`src/lib/curation/process.ts`:

```typescript
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
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/curation/process.test.ts
```
Expected: PASS (8 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/curation/process.ts src/lib/curation/process.test.ts
git commit -m "feat(curation): processCollectedItem orchestration (OG → curate → DB)"
```

---

## Task 6: `src/lib/curation/data.ts` + 테스트

**Files:**
- Create: `src/lib/curation/data.ts`
- Create: `src/lib/curation/data.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/curation/data.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

beforeEach(() => vi.clearAllMocks());

import { getCurationItems, getCategoryCounts } from "./data";

describe("getCurationItems", () => {
  test("filter=all → processed_at NOT NULL", async () => {
    const orderMock = vi.fn(() => Promise.resolve({ data: [], error: null }));
    fromMock.mockReturnValue({
      select: () => ({
        not: () => ({ order: orderMock }),
      }),
    });
    await getCurationItems("all");
    expect(orderMock).toHaveBeenCalledWith("processed_at", { ascending: false });
  });

  test("filter=카테고리 → eq(category) 추가", async () => {
    const eqMock = vi.fn(() => ({ order: () => Promise.resolve({ data: [], error: null }) }));
    fromMock.mockReturnValue({
      select: () => ({
        not: () => ({ eq: eqMock }),
      }),
    });
    await getCurationItems("여행");
    expect(eqMock).toHaveBeenCalledWith("category", "여행");
  });

  test("filter=dead-letter → attempts>=5 + processed_at NULL", async () => {
    const orderMock = vi.fn(() => Promise.resolve({ data: [], error: null }));
    fromMock.mockReturnValue({
      select: () => ({
        gte: () => ({ is: () => ({ order: orderMock }) }),
      }),
    });
    await getCurationItems("dead-letter");
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  test("결과 매핑 (snake → camel)", async () => {
    const row = {
      id: "i1", url: "u", memo: null,
      summary: "s", category: "여행",
      og_title: "T", og_description: "D", og_image: "I",
      created_at: "c", processed_at: "p",
    };
    fromMock.mockReturnValue({
      select: () => ({
        not: () => ({ order: () => Promise.resolve({ data: [row], error: null }) }),
      }),
    });
    const r = await getCurationItems("all");
    expect(r[0].ogTitle).toBe("T");
    expect(r[0].processedAt).toBe("p");
  });

  test("getCategoryCounts: filter별 카운트 합산", async () => {
    fromMock.mockImplementation(() => ({
      select: (_: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          return {
            not: () => Promise.resolve({ count: 8, error: null }),
            gte: () => ({ is: () => Promise.resolve({ count: 1, error: null }) }),
          };
        }
        return { not: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
      },
    }));
    const r = await getCategoryCounts();
    expect(typeof r["all"]).toBe("number");
    expect(typeof r["dead-letter"]).toBe("number");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/lib/curation/data.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`src/lib/curation/data.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { CURATION_CATEGORIES, type CurationCategory } from "./categories";

export type CurationItem = {
  id: string;
  url: string;
  memo: string | null;
  summary: string;
  category: CurationCategory;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  createdAt: string;
  processedAt: string;
};

export type CurationFilter = CurationCategory | "all" | "dead-letter";

type Row = {
  id: string;
  url: string;
  memo: string | null;
  summary: string | null;
  category: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  created_at: string;
  processed_at: string | null;
};

function mapRow(row: Row): CurationItem {
  return {
    id: row.id,
    url: row.url,
    memo: row.memo,
    summary: row.summary ?? "",
    category: (row.category ?? "기타") as CurationCategory,
    ogTitle: row.og_title ?? "",
    ogDescription: row.og_description ?? "",
    ogImage: row.og_image ?? "",
    createdAt: row.created_at,
    processedAt: row.processed_at ?? row.created_at,
  };
}

const SELECT_COLS =
  "id, url, memo, summary, category, og_title, og_description, og_image, created_at, processed_at";

export async function getCurationItems(filter: CurationFilter): Promise<CurationItem[]> {
  const sb = await createClient();

  if (filter === "dead-letter") {
    const { data } = await sb
      .from("collected_items")
      .select(SELECT_COLS)
      .gte("processing_attempts", 5)
      .is("processed_at", null)
      .order("created_at", { ascending: false });
    return (data ?? []).map((r) => mapRow(r as Row));
  }

  if (filter === "all") {
    const { data } = await sb
      .from("collected_items")
      .select(SELECT_COLS)
      .not("processed_at", "is", null)
      .order("processed_at", { ascending: false });
    return (data ?? []).map((r) => mapRow(r as Row));
  }

  // 단일 카테고리
  const { data } = await sb
    .from("collected_items")
    .select(SELECT_COLS)
    .not("processed_at", "is", null)
    .eq("category", filter)
    .order("processed_at", { ascending: false });
  return (data ?? []).map((r) => mapRow(r as Row));
}

export async function getCategoryCounts(): Promise<Record<CurationFilter, number>> {
  const sb = await createClient();

  const out: Record<CurationFilter, number> = {
    "all": 0, "dead-letter": 0,
    "음식·카페": 0, "여행": 0, "패션": 0, "운동": 0,
    "인테리어": 0, "영감": 0, "정보·꿀팁": 0, "기타": 0,
  };

  // all
  const { count: allCount } = await sb
    .from("collected_items")
    .select("id", { count: "exact", head: true })
    .not("processed_at", "is", null);
  out.all = allCount ?? 0;

  // dead-letter
  const { count: deadCount } = await sb
    .from("collected_items")
    .select("id", { count: "exact", head: true })
    .gte("processing_attempts", 5)
    .is("processed_at", null);
  out["dead-letter"] = deadCount ?? 0;

  // 카테고리별 (8회 쿼리, 단일 사용자 환경에서 충분)
  for (const cat of CURATION_CATEGORIES) {
    const { count } = await sb
      .from("collected_items")
      .select("id", { count: "exact", head: true })
      .not("processed_at", "is", null)
      .eq("category", cat);
    out[cat] = count ?? 0;
  }

  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/curation/data.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/curation/data.ts src/lib/curation/data.test.ts
git commit -m "feat(curation): list/count 헬퍼 (filter별)"
```

---

## Task 7: `src/app/api/curation/process/route.ts` + 테스트

**Files:**
- Create: `src/app/api/curation/process/route.ts`
- Create: `src/app/api/curation/process/route.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/app/api/curation/process/route.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock, processMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  processMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: fromMock }),
}));
vi.mock("@/lib/curation/process", () => ({
  processCollectedItem: processMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://x";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
});

import { POST } from "./route";

function authedReq(): Request {
  return new Request("http://x/api/curation/process", {
    method: "POST",
    headers: { authorization: "Bearer s" },
  });
}

describe("POST /api/curation/process", () => {
  test("CRON_SECRET 불일치 → 401", async () => {
    const req = new Request("http://x", { method: "POST" });
    const r = await POST(req);
    expect(r.status).toBe(401);
  });

  test("처리할 항목 없음 → processed=0", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        is: () => ({
          lt: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
        }),
      }),
    });
    const r = await POST(authedReq());
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.processed).toBe(0);
  });

  test("3개 항목 → 결과 집계", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        is: () => ({
          lt: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({
            data: [{ id: "a" }, { id: "b" }, { id: "c" }], error: null,
          }) }) }) }),
        }),
      }),
    });
    processMock.mockResolvedValueOnce("success").mockResolvedValueOnce("transient_failure").mockResolvedValueOnce("permanent_failure");
    const r = await POST(authedReq());
    const json = await r.json();
    expect(json.processed).toBe(3);
    expect(json.success).toBe(1);
    expect(json.transient).toBe(1);
    expect(json.permanent).toBe(1);
  });

  test("limit 20개로 호출되는지", async () => {
    const limitMock = vi.fn(() => Promise.resolve({ data: [], error: null }));
    fromMock.mockReturnValue({
      select: () => ({
        is: () => ({
          lt: () => ({ eq: () => ({ order: () => ({ limit: limitMock }) }) }),
        }),
      }),
    });
    await POST(authedReq());
    expect(limitMock).toHaveBeenCalledWith(20);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/app/api/curation/process/route.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`src/app/api/curation/process/route.ts`:

```typescript
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
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/app/api/curation/process/route.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/curation/process/route.ts src/app/api/curation/process/route.test.ts
git commit -m "feat(api): /api/curation/process cron route (20개 배치)"
```

---

## Task 8: `src/app/api/collect/route.ts` 수정 + 테스트 추가

**Files:**
- Modify: `src/app/api/collect/route.ts`
- Create: `src/app/api/collect/route.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/app/api/collect/route.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock, checkLimitMock, processMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  checkLimitMock: vi.fn(),
  processMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: fromMock }),
}));
vi.mock("@/lib/rateLimit/upstash", () => ({
  checkCollectLimit: checkLimitMock,
}));
vi.mock("@/lib/curation/process", () => ({
  processCollectedItem: processMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.COLLECT_API_KEY = "tok";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://x";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  process.env.DEFAULT_USER_ID = "u1";
  checkLimitMock.mockResolvedValue({ ok: true });
  processMock.mockResolvedValue("success");
});

function req(body: unknown, headers: Record<string, string> = { authorization: "Bearer tok" }) {
  return new Request("http://x/api/collect", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function mockInsertOk(id = "i1") {
  fromMock
    .mockReturnValueOnce({ // duplicate check select
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
    })
    .mockReturnValueOnce({ // insert
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id }, error: null }) }) }),
    });
}

import { POST } from "./route";

describe("POST /api/collect", () => {
  test("Bearer 불일치 → 401", async () => {
    const r = await POST(req({ url: "https://x" }, { authorization: "Bearer wrong" }));
    expect(r.status).toBe(401);
  });

  test("rate limit 초과 → 429 + Retry-After", async () => {
    checkLimitMock.mockResolvedValue({ ok: false, retryAfter: 42 });
    const r = await POST(req({ url: "https://x" }));
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("42");
  });

  test("URL 부적절 → 400", async () => {
    const r = await POST(req({ url: "ftp://x" }));
    expect(r.status).toBe(400);
  });

  test("중복 → 200 + duplicate=true", async () => {
    fromMock.mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "old" }, error: null }) }) }) }),
    });
    const r = await POST(req({ url: "https://x" }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.duplicate).toBe(true);
  });

  test("정상 insert → 201 + processCollectedItem 호출됨", async () => {
    mockInsertOk("new1");
    const r = await POST(req({ url: "https://x.com/p/abc" }));
    expect(r.status).toBe(201);
    expect(processMock).toHaveBeenCalledWith("new1");
  });

  test("processCollectedItem 실패해도 응답은 201 (베스트-에포트)", async () => {
    mockInsertOk("new2");
    processMock.mockRejectedValue(new Error("anthropic down"));
    const r = await POST(req({ url: "https://x.com/p/abc" }));
    expect(r.status).toBe(201);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/app/api/collect/route.test.ts
```
Expected: FAIL — `checkCollectLimit` 미사용 (현 collect 코드는 rate limit 없음).

- [ ] **Step 3: 라우트 수정**

`src/app/api/collect/route.ts` 전체 교체:

```typescript
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireBearer } from "@/lib/auth/requireBearer";
import { checkCollectLimit } from "@/lib/rateLimit/upstash";
import { processCollectedItem } from "@/lib/curation/process";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const auth = requireBearer(request, process.env.COLLECT_API_KEY);
  if (!auth.ok) return auth.response;

  const limit = await checkCollectLimit();
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
    );
  }

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

    // 베스트-에포트 인라인 처리. 실패해도 201 유지(다음 cron이 회수).
    const inserted = data as { id: string };
    try {
      await processCollectedItem(inserted.id);
    } catch (err) {
      console.error("collect inline process:", err instanceof Error ? err.message : "unknown");
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Collect API error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/app/api/collect/route.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/collect/route.ts src/app/api/collect/route.test.ts
git commit -m "feat(api): /api/collect rate limit + 인라인 큐레이션 (201 베스트-에포트)"
```

---

## Task 9: `src/app/(main)/memo/curation/actions.ts` + 테스트

**Files:**
- Create: `src/app/(main)/memo/curation/actions.ts`
- Create: `src/app/(main)/memo/curation/actions.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/app/(main)/memo/curation/actions.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock, requireSessionMock, revalidatePathMock, processMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  requireSessionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  processMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));
vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: requireSessionMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/curation/process", () => ({ processCollectedItem: processMock }));

beforeEach(() => {
  vi.clearAllMocks();
  requireSessionMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
});

import { updateCurationCategory, deleteCuration, reprocessCuration } from "./actions";

describe("updateCurationCategory", () => {
  test("미인증 → 거부", async () => {
    requireSessionMock.mockResolvedValue({ ok: false, response: new Response() });
    const r = await updateCurationCategory("i1", "여행");
    expect(r.ok).toBe(false);
  });

  test("invalid category → 거부", async () => {
    const r = await updateCurationCategory("i1", "랜덤" as never);
    expect(r.ok).toBe(false);
  });

  test("정상 → update + revalidate", async () => {
    const eq = vi.fn(() => Promise.resolve({ error: null }));
    fromMock.mockReturnValue({ update: vi.fn(() => ({ eq })) });
    const r = await updateCurationCategory("i1", "여행");
    expect(r.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/memo");
  });
});

describe("deleteCuration", () => {
  test("미인증 → 거부", async () => {
    requireSessionMock.mockResolvedValue({ ok: false, response: new Response() });
    const r = await deleteCuration("i1");
    expect(r.ok).toBe(false);
  });

  test("정상 삭제", async () => {
    const eq = vi.fn(() => Promise.resolve({ error: null }));
    fromMock.mockReturnValue({ delete: vi.fn(() => ({ eq })) });
    const r = await deleteCuration("i1");
    expect(r.ok).toBe(true);
  });
});

describe("reprocessCuration", () => {
  test("정상 → reset + processCollectedItem 호출", async () => {
    const eq = vi.fn(() => Promise.resolve({ error: null }));
    fromMock.mockReturnValue({ update: vi.fn(() => ({ eq })) });
    processMock.mockResolvedValue("success");
    const r = await reprocessCuration("i1");
    expect(r.ok).toBe(true);
    expect(processMock).toHaveBeenCalledWith("i1");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/app/\(main\)/memo/curation/actions.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`src/app/(main)/memo/curation/actions.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { revalidatePath } from "next/cache";
import { isCurationCategory, type CurationCategory } from "@/lib/curation/categories";
import { processCollectedItem } from "@/lib/curation/process";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/memo");
}

export async function updateCurationCategory(
  id: string,
  category: CurationCategory
): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };
  if (!isCurationCategory(category)) return { ok: false, error: "잘못된 카테고리" };

  try {
    const sb = await createClient();
    const { error } = await sb
      .from("collected_items")
      .update({ category })
      .eq("id", id);
    if (error) return { ok: false, error: "Update failed" };
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("updateCurationCategory:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Update failed" };
  }
}

export async function deleteCuration(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };
  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };

  try {
    const sb = await createClient();
    const { error } = await sb.from("collected_items").delete().eq("id", id);
    if (error) return { ok: false, error: "Delete failed" };
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("deleteCuration:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Delete failed" };
  }
}

export async function reprocessCuration(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };
  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };

  try {
    const sb = await createClient();
    const { error } = await sb
      .from("collected_items")
      .update({ processed_at: null, processing_attempts: 0, last_error: null })
      .eq("id", id);
    if (error) return { ok: false, error: "Reset failed" };

    // 인라인 1회 시도 (실패해도 cron이 다음 라운드에서 다시)
    try {
      await processCollectedItem(id);
    } catch (err) {
      console.error("reprocessCuration inline:", err instanceof Error ? err.message : "unknown");
    }

    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("reprocessCuration:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Reprocess failed" };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run "src/app/(main)/memo/curation/actions.test.ts"
```
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(main)/memo/curation/actions.ts" "src/app/(main)/memo/curation/actions.test.ts"
git commit -m "feat(curation): Server Actions (updateCategory/delete/reprocess)"
```

---

## Task 10: `CurationCard.tsx` (시각 컴포넌트, 테스트 없음)

**Files:**
- Create: `src/app/(main)/memo/curation/CurationCard.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/app/(main)/memo/curation/CurationCard.tsx`:

```typescript
"use client";

import type { CurationItem } from "@/lib/curation/data";

type Props = {
  item: CurationItem;
  isDeadLetter?: boolean;
  onMore: (item: CurationItem) => void;
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const day = Math.floor(diffMs / 86400_000);
  if (day === 0) return "오늘";
  if (day === 1) return "어제";
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  return `${Math.floor(day / 30)}달 전`;
}

export function CurationCard({ item, isDeadLetter, onMore }: Props) {
  if (isDeadLetter) {
    return (
      <div className="bg-danger-soft/30 border border-hair rounded-card shadow-card p-3 mb-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[11px] px-2 py-0.5 bg-danger-soft text-danger rounded-chip font-bold">
            ⚠ 처리 실패
          </span>
          <span className="text-[11px] text-ink-muted">{relativeTime(item.createdAt)}</span>
        </div>
        <a href={item.url} target="_blank" rel="noopener noreferrer"
           className="text-[12px] text-ink-sub break-all underline">
          {item.url}
        </a>
        <button
          onClick={() => onMore(item)}
          className="mt-2 text-[12px] px-3 py-1 bg-ink text-white rounded-input font-semibold"
        >
          재처리
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-card border border-hair shadow-card p-3 mb-3 flex gap-3 active:opacity-80">
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
        {item.ogImage ? (
          <img
            src={item.ogImage}
            alt=""
            className="w-[88px] h-[88px] rounded-input bg-hair-light object-cover"
          />
        ) : (
          <div className="w-[88px] h-[88px] rounded-input bg-hair-light flex items-center justify-center text-2xl">
            🔗
          </div>
        )}
      </a>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0 block"
      >
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[11px] px-2 py-0.5 bg-primary-soft text-primary rounded-chip font-semibold">
            {item.category}
          </span>
          <span className="text-[11px] text-ink-muted">{relativeTime(item.processedAt)}</span>
        </div>
        {item.ogTitle && (
          <div className="text-[14px] font-bold text-ink line-clamp-1 mb-0.5">
            {item.ogTitle}
          </div>
        )}
        <div className="text-[12px] text-ink-sub line-clamp-2">{item.summary}</div>
      </a>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMore(item);
        }}
        aria-label="더보기"
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-ink-muted text-lg"
      >
        ⋯
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(main)/memo/curation/CurationCard.tsx"
git commit -m "feat(curation): CurationCard (88x88 썸네일 + 텍스트 + ⋯)"
```

---

## Task 11: `CurationEditSheet.tsx` (시각 컴포넌트)

**Files:**
- Create: `src/app/(main)/memo/curation/CurationEditSheet.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/app/(main)/memo/curation/CurationEditSheet.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import type { CurationItem } from "@/lib/curation/data";
import { CURATION_CATEGORIES, type CurationCategory } from "@/lib/curation/categories";
import { updateCurationCategory, deleteCuration, reprocessCuration } from "./actions";

type Props = {
  item: CurationItem | null;
  onClose: () => void;
};

export function CurationEditSheet({ item, onClose }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CurationCategory | null>(item?.category ?? null);

  if (!item) return null;

  const isDeadLetter = !item.summary;

  function applyCategory(cat: CurationCategory) {
    setSelected(cat);
    setError(null);
    startTransition(async () => {
      const r = await updateCurationCategory(item!.id, cat);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  function handleDelete() {
    if (!confirm("이 항목을 삭제할까요?")) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteCuration(item!.id);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  function handleReprocess() {
    setError(null);
    startTransition(async () => {
      const r = await reprocessCuration(item!.id);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full bg-surface rounded-t-sheet p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-hair rounded-full mx-auto mb-4" />

        {!isDeadLetter && (
          <>
            <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-2">
              카테고리 변경
            </div>
            <div className="flex flex-wrap gap-1.5 mb-5">
              {CURATION_CATEGORIES.map((c) => (
                <button
                  key={c}
                  disabled={pending}
                  onClick={() => applyCategory(c)}
                  className={
                    selected === c
                      ? "text-[12px] px-3 py-1.5 bg-primary text-white rounded-input font-bold"
                      : "text-[12px] px-3 py-1.5 bg-hair-light text-ink-sub rounded-input font-semibold"
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2">
          <button
            disabled={pending}
            onClick={handleReprocess}
            className="flex-1 text-[13px] py-2.5 bg-ink text-white rounded-btn font-bold disabled:opacity-50"
          >
            {isDeadLetter ? "재처리" : "다시 분류"}
          </button>
          <button
            disabled={pending}
            onClick={handleDelete}
            className="flex-1 text-[13px] py-2.5 bg-danger-soft text-danger rounded-btn font-bold disabled:opacity-50"
          >
            삭제
          </button>
        </div>

        {error && <p className="text-[12px] text-danger mt-3">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(main)/memo/curation/CurationEditSheet.tsx"
git commit -m "feat(curation): EditSheet (카테고리 변경/삭제/재처리)"
```

---

## Task 12: `CurationTab.tsx` (시각 컴포넌트)

**Files:**
- Create: `src/app/(main)/memo/curation/CurationTab.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/app/(main)/memo/curation/CurationTab.tsx`:

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import type { CurationItem, CurationFilter } from "@/lib/curation/data";
import { CURATION_CATEGORIES } from "@/lib/curation/categories";
import { CurationCard } from "./CurationCard";
import { CurationEditSheet } from "./CurationEditSheet";

type Props = {
  items: CurationItem[];
  counts: Record<CurationFilter, number>;
  activeFilter: CurationFilter;
};

export function CurationTab({ items, counts, activeFilter }: Props) {
  const [editing, setEditing] = useState<CurationItem | null>(null);

  const chipDefs: Array<{ key: CurationFilter; label: string }> = [
    { key: "all", label: "전체" },
    ...CURATION_CATEGORIES.map((c) => ({ key: c as CurationFilter, label: c })),
  ];
  if (counts["dead-letter"] > 0) {
    chipDefs.push({ key: "dead-letter", label: "⚠ 처리 실패" });
  }

  return (
    <div>
      {/* 카테고리 chip 필터 */}
      <div className="px-4 pt-3 pb-2 overflow-x-auto whitespace-nowrap bg-surface border-b border-hair-light">
        {chipDefs.map((chip) => {
          const active = chip.key === activeFilter;
          const n = counts[chip.key] ?? 0;
          const href =
            chip.key === "all"
              ? "/memo?tab=curation"
              : `/memo?tab=curation&cat=${encodeURIComponent(chip.key)}`;
          return (
            <Link
              key={chip.key}
              href={href}
              replace
              className={
                active
                  ? "inline-block mr-1.5 px-3 py-1.5 rounded-input bg-ink text-white text-[12px] font-bold"
                  : "inline-block mr-1.5 px-3 py-1.5 rounded-input bg-hair-light text-ink-sub text-[12px] font-semibold"
              }
            >
              {chip.label} {n > 0 && <span className="opacity-70">{n}</span>}
            </Link>
          );
        })}
      </div>

      {/* 카드 리스트 */}
      <div className="p-4">
        {items.length === 0 ? (
          <div className="px-4 py-12 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-primary-soft flex items-center justify-center text-3xl mb-4">
              📥
            </div>
            <p className="text-[13px] text-ink-sub leading-relaxed max-w-xs">
              아직 큐레이션된 항목이 없어요. 인스타에서 단축어로 링크를 보내면 여기 자동으로 정리돼요.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <CurationCard
              key={item.id}
              item={item}
              isDeadLetter={activeFilter === "dead-letter"}
              onMore={setEditing}
            />
          ))
        )}
      </div>

      <CurationEditSheet item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(main)/memo/curation/CurationTab.tsx"
git commit -m "feat(curation): CurationTab (chip 필터 + 카드 리스트 + 시트)"
```

---

## Task 13: 인박스 폐기 (파일/함수 삭제)

**Files:**
- Delete: `src/app/(main)/memo/InboxButton.tsx`
- Delete: `src/app/(main)/memo/InboxSheet.tsx`
- Delete: `src/app/(main)/memo/MemoCurationPlaceholder.tsx`
- Modify: `src/app/(main)/memo/actions.ts` — `organizeInbox`, `saveInboxGroups`, `validateGroup`, `fetchOGMeta`, `InboxGroup` type 제거
- Modify: `src/app/(main)/memo/actions.test.ts` — 인박스 관련 테스트 제거
- Modify: `src/lib/memo/list.ts` — `getInboxCount`, `getInboxItems`, `CollectedItem` type 제거

- [ ] **Step 1: 컴포넌트 파일 3개 삭제**

```bash
rm "src/app/(main)/memo/InboxButton.tsx"
rm "src/app/(main)/memo/InboxSheet.tsx"
rm "src/app/(main)/memo/MemoCurationPlaceholder.tsx"
```

- [ ] **Step 2: `src/app/(main)/memo/actions.ts` 정리**

다음 코드를 통째로 교체. 인박스 관련 항목 4개 제거하고 메모 CRUD만 남김.

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { revalidatePath } from "next/cache";
import { MEMO_TAGS } from "@/lib/constants";

export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const MAX_CONTENT = 8192;

export type MemoInput = { content: string; tag: string };

function validateMemo(input: MemoInput): { ok: true } | { ok: false; error: string } {
  if (typeof input.content !== "string") return { ok: false, error: "잘못된 내용" };
  const trimmed = input.content.trim();
  if (trimmed.length === 0) return { ok: false, error: "내용이 비어 있어요" };
  if (trimmed.length > MAX_CONTENT) return { ok: false, error: "내용이 너무 길어요" };
  if (typeof input.tag !== "string" || !MEMO_TAGS.includes(input.tag as (typeof MEMO_TAGS)[number])) {
    return { ok: false, error: "잘못된 태그" };
  }
  return { ok: true };
}

function revalidate() {
  revalidatePath("/memo");
  revalidatePath("/home");
}

export async function createMemo(input: MemoInput): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  const v = validateMemo(input);
  if (!v.ok) return v;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("memo_entries")
      .insert({ content: input.content.trim(), tag: input.tag })
      .select("id")
      .single();
    if (error) return { ok: false, error: "Save failed" };
    revalidate();
    return { ok: true, id: (data as { id: string }).id };
  } catch (err) {
    console.error("createMemo:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Save failed" };
  }
}

export async function updateMemo(id: string, input: MemoInput): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };
  const v = validateMemo(input);
  if (!v.ok) return v;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("memo_entries")
      .update({ content: input.content.trim(), tag: input.tag })
      .eq("id", id);
    if (error) return { ok: false, error: "Update failed" };
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("updateMemo:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Update failed" };
  }
}

export async function deleteMemo(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  if (typeof id !== "string" || !id) return { ok: false, error: "잘못된 id" };

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("memo_entries").delete().eq("id", id);
    if (error) return { ok: false, error: "Delete failed" };
    revalidate();
    return { ok: true };
  } catch (err) {
    console.error("deleteMemo:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Delete failed" };
  }
}
```

- [ ] **Step 3: `src/app/(main)/memo/actions.test.ts`에서 인박스 관련 테스트 제거**

`saveInboxGroups`/`organizeInbox` import 제거. 해당 `describe` 블록 제거. 파일에 `createMemo`/`updateMemo`/`deleteMemo` describe만 남도록.

구체적인 변경: 파일 상단 import 라인에서 `saveInboxGroups`를 빼고, 해당 함수를 호출하는 `describe`/`test` 블록을 모두 삭제.

(인박스 관련 describe가 없으면 skip 가능 — 기존 actions.test.ts를 읽어서 확인 후 정리)

- [ ] **Step 4: `src/lib/memo/list.ts` 정리**

```typescript
import { createClient } from "@/lib/supabase/server";

export type MemoEntry = {
  id: string;
  content: string;
  tag: string;
  created_at: string;
};

export async function getAllMemos(): Promise<MemoEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memo_entries")
    .select("id, content, tag, created_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as MemoEntry[];
}
```

`CollectedItem`, `getInboxCount`, `getInboxItems` 모두 제거.

- [ ] **Step 5: 테스트 + 빌드 (page.tsx 수정 전 회귀 가능 — 다음 task에서 마무리)**

```bash
npx vitest run
```
Expected: page.tsx가 아직 InboxButton을 import하고 있어서 일부 fail 가능. 그대로 다음 task로.

```bash
npm run build
```
Expected: page.tsx 수정 전이라 build fail 가능 (다음 task에서 해결).

- [ ] **Step 6: 커밋 (체크포인트, 다음 task와 함께 합쳐도 됨)**

```bash
git add -u
git commit -m "refactor(memo): 인박스 흐름 폐기 (Phase 2 자동화로 대체)"
```

---

## Task 14: `src/app/(main)/memo/page.tsx` 통합

**Files:**
- Modify: `src/app/(main)/memo/page.tsx`

- [ ] **Step 1: page.tsx 전체 교체**

```typescript
import { Suspense } from "react";
import Link from "next/link";
import { getAllMemos } from "@/lib/memo/list";
import { getCurationItems, getCategoryCounts, type CurationFilter } from "@/lib/curation/data";
import { isCurationCategory } from "@/lib/curation/categories";
import { MemoTab } from "./MemoTab";
import { CurationTab } from "./curation/CurationTab";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ tab?: string; cat?: string }>;

export default async function MemoPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const activeTab = params.tab === "curation" ? "curation" : "memo";

  const memos = activeTab === "memo" ? await getAllMemos() : [];

  let curationItems: Awaited<ReturnType<typeof getCurationItems>> = [];
  let curationCounts: Awaited<ReturnType<typeof getCategoryCounts>> | null = null;
  let activeFilter: CurationFilter = "all";

  if (activeTab === "curation") {
    if (params.cat === "dead-letter") activeFilter = "dead-letter";
    else if (params.cat && isCurationCategory(params.cat)) activeFilter = params.cat;

    [curationItems, curationCounts] = await Promise.all([
      getCurationItems(activeFilter),
      getCategoryCounts(),
    ]);
  }

  return (
    <div className="pb-24">
      {/* 헤더 */}
      <div className="bg-surface px-4 pt-5 pb-3 border-b border-hair-light">
        <h1 className="text-[18px] font-extrabold tracking-tight">메모</h1>
      </div>

      {/* 탭 헤더 */}
      <div className="flex gap-1.5 px-4 pt-3 pb-2 bg-surface">
        <Link
          href="/memo"
          replace
          className={
            activeTab === "memo"
              ? "px-3 py-1.5 rounded-input bg-ink text-white text-[12px] font-bold"
              : "px-3 py-1.5 rounded-input bg-hair-light text-ink-sub text-[12px] font-semibold"
          }
        >
          메모
        </Link>
        <Link
          href="/memo?tab=curation"
          replace
          className={
            activeTab === "curation"
              ? "px-3 py-1.5 rounded-input bg-ink text-white text-[12px] font-bold"
              : "px-3 py-1.5 rounded-input bg-hair-light text-ink-sub text-[12px] font-semibold"
          }
        >
          큐레이션
        </Link>
      </div>

      {activeTab === "memo" ? (
        <Suspense fallback={null}>
          <MemoTab memos={memos} />
        </Suspense>
      ) : (
        <CurationTab
          items={curationItems}
          counts={curationCounts ?? ({} as ReturnType<typeof Object>)}
          activeFilter={activeFilter}
        />
      )}
    </div>
  );
}
```

(주: `curationCounts ?? ({} as ...)` 부분은 `activeTab === "curation"`이면 항상 채워지므로 사실 fallback이 안 탐. 타입 좁히기 위한 형식. 더 깨끗하게는 `activeTab === "curation" && curationCounts && ...` 가드로 분리해도 됨.)

- [ ] **Step 2: 테스트 + 빌드**

```bash
npx vitest run
```
Expected: PASS (전체).

```bash
npm run build
```
Expected: 성공 (env 없이).

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(main)/memo/page.tsx"
git commit -m "feat(memo): page.tsx에 큐레이션 탭 통합 + 인박스 헤더 제거"
```

---

## Task 15: 최종 검증 + 결산

**Files:**
- Create: `docs/superpowers/specs/2026-04-27-phase2-completion.md`

- [ ] **Step 1: 전체 테스트**

```bash
npx vitest run
```
Expected: 전체 PASS. 신규 ~40개 + 기존 - 인박스 일부 = 약 130-145 tests.

- [ ] **Step 2: 빌드 (env 없이)**

```bash
npm run build
```
Expected: 성공.

- [ ] **Step 3: lint**

```bash
npm run lint
```
Expected: 경고만 (에러 없음).

- [ ] **Step 4: 마이그레이션 SQL 사용자에게 알림**

**중요**: 다음 메시지를 사용자에게 전달.

> Phase 2 코드 완료. 배포 전 다음 두 단계가 필요합니다:
> 1. Supabase Dashboard → SQL Editor → `supabase_migration_phase2_curation.sql` 전체 붙여넣기 → Run
> 2. Vercel Dashboard → Environment Variables에 `CRON_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`이 있는지 확인 (Phase 0에서 등록됨)
> 3. Vercel cron이 호출 시 `Authorization: Bearer ${CRON_SECRET}` 헤더를 포함하도록 설정 (Vercel 콘솔 cron 설정 또는 vercel.json `crons`의 헤더 옵션)

- [ ] **Step 5: 완료 보고서 작성**

`docs/superpowers/specs/2026-04-27-phase2-completion.md`:

```markdown
# Phase 2 완료 보고 (2026-04-27)

**브랜치**: `phase2-curation-automation`
**최종 검증**: `npm test` PASS, `npm run build` env 없이 PASS.

## 적용된 변경

### 신규 모듈
- `src/lib/curation/categories.ts` (+ test)
- `src/lib/curation/curate.ts` (+ test, Anthropic Haiku 4.5 + ephemeral cache)
- `src/lib/curation/process.ts` (+ test, OG → curate → DB 오케스트레이션)
- `src/lib/curation/data.ts` (+ test, list/count)
- `src/lib/rateLimit/upstash.ts` (+ test, 60/h + 200/d)
- `src/lib/auth/requireCronSecret.ts` (+ test, timing-safe Bearer)

### API 라우트
- `src/app/api/curation/process/route.ts` (+ test, cron 진입점)
- `src/app/api/collect/route.ts` (수정 + test) — rate limit + 인라인 처리

### UI
- `src/app/(main)/memo/curation/actions.ts` (+ test, update/delete/reprocess)
- `src/app/(main)/memo/curation/CurationTab.tsx`
- `src/app/(main)/memo/curation/CurationCard.tsx`
- `src/app/(main)/memo/curation/CurationEditSheet.tsx`
- `src/app/(main)/memo/page.tsx` (재작성, curation 탭 통합)

### 폐기 (인박스 흐름)
- `src/app/(main)/memo/InboxButton.tsx` 삭제
- `src/app/(main)/memo/InboxSheet.tsx` 삭제
- `src/app/(main)/memo/MemoCurationPlaceholder.tsx` 삭제
- `src/app/(main)/memo/actions.ts`에서 organizeInbox/saveInboxGroups 제거
- `src/lib/memo/list.ts`에서 getInboxItems/getInboxCount 제거

### 기타
- `vercel.json` 신규 (cron 등록)
- `supabase_migration_phase2_curation.sql` 신규
- `package.json`에 @upstash/ratelimit, @upstash/redis 추가
- `.env.example`에 CRON_SECRET, UPSTASH_REDIS_* 추가

## 검증 결과

| 항목 | 상태 |
|------|------|
| `npm test` | ✅ |
| `npm run build` env 없이 | ✅ |
| 인박스 코드/테스트 잔존 | ❌ (모두 제거됨) |

## 사용자 후속 작업

1. Supabase SQL Editor에서 `supabase_migration_phase2_curation.sql` 실행
2. Vercel cron 호출 시 Authorization Bearer secret 포함되는지 콘솔 확인
3. 단축어로 1건 보내고 5초 안에 큐레이션 탭에 표시되는지, 1시간 뒤 cron이 누락분 회수하는지 관찰
4. Anthropic 콘솔에서 cache_read_input_tokens 발생하는지 확인 (두 번째 호출 이후)

## 알려진 트레이드오프 / 후속

- `is_processed` 칼럼 + 레거시 행 cleanup → 후속 PR
- 큐레이션 카드에서 메모로 이동 액션 → 미구현 (필요 시 후속)
- 일괄 재처리 → 미구현
```

- [ ] **Step 6: 결산 커밋 + push**

```bash
git add docs/superpowers/specs/2026-04-27-phase2-completion.md
git commit -m "docs(phase2): 완료 보고"
git push -u origin phase2-curation-automation
```

- [ ] **Step 7: PR 생성 (사용자가 명시적으로 요청 시)**

사용자에게 PR을 만들지 물어본 뒤 진행.

```bash
gh pr create --title "Phase 2 — 인스타 링크 자동 큐레이션" --body "$(cat <<'EOF'
## Summary
- /api/collect에 동기 OG fetch + Anthropic Haiku 4.5 요약·분류 적용 (베스트-에포트, 항상 201)
- 1시간 cron이 미처리 항목(attempts<5) 최대 20개 회수
- /memo?tab=curation에 카테고리 chip 필터 + 카드 리스트
- 수동 인박스 흐름(InboxButton/organizeInbox 등) 폐기 — Phase 2 자동화로 완전 대체
- Upstash rate limit (collect:global, 60/h + 200/d)

## Test plan
- [ ] Supabase SQL Editor에서 마이그레이션 실행
- [ ] Vercel 환경변수 + cron 헤더 설정 확인
- [ ] 단축어로 1건 보내 → 5~10초 후 큐레이션 탭에 표시되는지
- [ ] 1시간 뒤 cron이 미처리 항목 회수하는지 (Vercel Logs)
- [ ] Anthropic 콘솔에서 cache_read 발생 확인

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review 체크리스트

이 plan이 spec을 모두 커버하는지:

- [x] 결정 1 (베스트-에포트 201) → Task 8 step 3 (try/catch around processCollectedItem, 항상 201)
- [x] 결정 2 (cron a3+b2+c1) → Task 7 (limit 20, attempts<5 필터, 직렬 처리)
- [x] 결정 3 (개별 호출 + 캐시) → Task 4 (system 배열 + cache_control: ephemeral)
- [x] 결정 4 (인박스 폐기) → Task 13 (파일/함수 모두 제거)
- [x] 결정 5 (리스트 카드 UI) → Task 10 (CurationCard 88x88), Task 12 (탭 + chip 필터)
- [x] 결정 6 (rate limit collect:global 60/200) → Task 3 (upstash) + Task 8 (collect 통합)
- [x] 결정 7 (dead-letter 가상 카테고리) → Task 12 (chipDefs에 조건부 추가)
- [x] DB 마이그레이션 → Task 0
- [x] 모듈 시그니처 일치: curate / process / data / rateLimit / requireCronSecret 모두 spec과 동일
- [x] vercel.json + .env.example → Task 0
- [x] 의존성 추가 → Task 0
- [x] 테스트 패턴 (vi.hoisted) → 모든 테스트 task에서 적용
- [x] 보안 (requireSession + 입력 검증 + console.error 메시지만) → Task 9
- [x] maxDuration 명시 → Task 7 (cron, 60), Task 8 (collect, 30)

placeholder/TODO/TBD: 없음.

타입 일관성:
- `CurationCategory`, `CurationFilter`, `CurationItem`, `ProcessOutcome`, `CurateInput/Result`, `ActionResult` — 모든 task에서 동일 시그니처.
- `processCollectedItem(itemId: string)` — Task 5 정의, Task 7/8/9에서 동일 호출.
- `checkCollectLimit()` — Task 3 정의, Task 8에서 호출, 반환 형식 일치.
- `requireCronSecret(req)` — Task 2 정의, Task 7에서 호출, 반환 형식 일치.

완료.
