# Phase 2 — 인스타 링크 자동 큐레이션

- **작성일**: 2026-04-27
- **상태**: Draft (사용자 컨펌 후 작성)
- **선행 조건**: Phase 0(보안 베이스라인), Phase 1.5a(메모 리노베이션) 완료
- **후속**: Phase 3(SMS 가계부 자동입력)

## 배경

`/api/collect`(iOS 단축어 → Bearer)는 인스타 링크를 `collected_items`에 단순 적재만 해 왔다. 메모 탭의 인박스 흐름(Phase 1.5a `organizeInbox` 서버 액션 + InboxButton)은 이 큐를 사용자가 수동 트리거해야 AI가 묶어 메모로 옮겨 주는 구조였다. 이번 Phase 2에서 이 흐름을 자동화한다.

목표는 단순하다: 단축어가 링크를 보내는 그 호출 안에서 OG 메타를 끌어오고 Claude Haiku 4.5가 한국어 요약과 카테고리를 생성하여 `collected_items` 자체를 in-place로 주석한다. 사용자는 `/memo?tab=curation`에서 카테고리별 카드 리스트로 결과만 본다.

수동 인박스 흐름은 Phase 2의 자동화가 그 존재 이유를 완전히 대체하므로 폐기한다.

## 결정 사항 (사용자 컨펌됨, 2026-04-27)

1. **실패 정책**: 베스트-에포트. row는 항상 저장, 외부 호출 실패 시 `processed_at = NULL`로 두고 cron이 회수.
2. **Cron**: 1시간 주기, 한 번에 최대 20개, `processing_attempts < 5`이면 회수, 5회 실패 후 dead-letter.
3. **AI 호출 구조**: 항목당 개별 호출. Anthropic 시스템 프롬프트에 `cache_control: ephemeral` 적용.
4. **인박스 흐름 폐기**: InboxButton/InboxSheet/`organizeInbox`/`saveInboxGroups`/`getInboxItems`/`getInboxCount` 모두 제거.
5. **UI**: 리스트 카드(Phase 1.5 일관성). 88×88 썸네일 + 텍스트. 카테고리 chip 필터. 탭 = 원본 URL 새 창. ⋯ 버튼 = 카테고리 변경/삭제/재처리.
6. **Rate limit**: Upstash sliding window. 키 `collect:global` 고정. 60/시간 + 200/일.
7. **Dead-letter UI**: 카테고리 chip row에 가상 카테고리 `처리 실패` 1개 추가(평소 0건이면 비표시).

## 카테고리

```
음식·카페 / 여행 / 패션 / 운동 / 인테리어 / 영감 / 정보·꿀팁 / 기타
```

## 데이터 모델

### 마이그레이션 (사용자가 Supabase SQL Editor에서 실행)

`supabase_migration_phase2_curation.sql`

```sql
ALTER TABLE collected_items
  ADD COLUMN IF NOT EXISTS summary              text,
  ADD COLUMN IF NOT EXISTS category             text,
  ADD COLUMN IF NOT EXISTS og_title             text,
  ADD COLUMN IF NOT EXISTS og_description       text,
  ADD COLUMN IF NOT EXISTS og_image             text,
  ADD COLUMN IF NOT EXISTS processed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS processing_attempts  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error           text;

-- cron 큐 스캔 (미처리 + 5회 미만 + 레거시 is_processed=true 제외)
CREATE INDEX IF NOT EXISTS collected_items_pending_idx
  ON collected_items (created_at ASC)
  WHERE processed_at IS NULL AND processing_attempts < 5 AND is_processed = false;

-- 큐레이션 탭 카테고리 필터
CREATE INDEX IF NOT EXISTS collected_items_curation_idx
  ON collected_items (category, created_at DESC)
  WHERE processed_at IS NOT NULL;
```

### `is_processed` 칼럼 처리

- 드롭하지 않는다. Phase 1.5a의 `saveInboxGroups`로 메모로 이전된 행들은 `is_processed = true`다. 이들은 `memo_entries`에 사본이 있으므로 큐레이션 탭에 다시 노출시키지 않는다.
- 큐레이션 탭 query: `processed_at IS NOT NULL` → 자연히 레거시 행 제외.
- cron query: `is_processed = false AND processed_at IS NULL AND processing_attempts < 5` → 레거시 행 제외.
- 새 `/api/collect`는 `is_processed`를 건드리지 않는다(기본값 `false` 유지).
- 후속 PR에서 `is_processed` 칼럼과 잔여 레거시 행을 깔끔히 정리할 수 있지만 이번 Phase에서는 out of scope.

## 모듈 구조

### 신규

| 경로 | 책임 |
|------|------|
| `src/lib/curation/categories.ts` | 카테고리 const 8개 + 타입 가드 |
| `src/lib/curation/curate.ts` | Anthropic Haiku 4.5 호출 (캐시 적용), JSON 파싱, transient/permanent 분류 |
| `src/lib/curation/process.ts` | OG fetch → curate → DB 갱신 오케스트레이션. collect/cron/reprocess 공통 |
| `src/lib/curation/data.ts` | 큐레이션 탭 query 함수 |
| `src/lib/rateLimit/upstash.ts` | Upstash Ratelimit 클라이언트 + `checkCollectLimit()` |
| `src/lib/auth/requireCronSecret.ts` | `Authorization: Bearer ${CRON_SECRET}` 검증 (timing-safe) |
| `src/app/api/curation/process/route.ts` | Vercel Cron 진입점 |
| `src/app/(main)/memo/curation/CurationTab.tsx` | chip 필터 + 카드 리스트 |
| `src/app/(main)/memo/curation/CurationCard.tsx` | 카드 1장 |
| `src/app/(main)/memo/curation/CurationEditSheet.tsx` | 카테고리 변경/삭제/재처리 바텀시트 |
| `src/app/(main)/memo/curation/actions.ts` | Server Actions: update/delete/reprocess |

### 수정

- `src/app/api/collect/route.ts` — rate limit + 인라인 처리 호출 추가
- `src/app/(main)/memo/page.tsx` — InboxButton 제거, 큐레이션 탭에 실 데이터 전달
- `src/app/(main)/memo/actions.ts` — `organizeInbox`, `saveInboxGroups`, `validateGroup`, `fetchOGMeta` 삭제
- `src/lib/memo/list.ts` — `getInboxItems`, `getInboxCount` 삭제

### 삭제

- `src/app/(main)/memo/InboxButton.tsx`
- `src/app/(main)/memo/InboxSheet.tsx`
- `src/app/(main)/memo/MemoCurationPlaceholder.tsx`
- 관련 테스트의 인박스 케이스

## 모듈 시그니처

### `src/lib/curation/categories.ts`

```typescript
export const CURATION_CATEGORIES = [
  "음식·카페", "여행", "패션", "운동",
  "인테리어", "영감", "정보·꿀팁", "기타",
] as const;
export type CurationCategory = typeof CURATION_CATEGORIES[number];
export function isCurationCategory(v: unknown): v is CurationCategory;
```

### `src/lib/curation/curate.ts`

```typescript
type CurateInput = {
  url: string;
  memo: string | null;
  ogTitle: string;
  ogDescription: string;
};
type CurateResult =
  | { ok: true; summary: string; category: CurationCategory }
  | { ok: false; kind: "transient" | "permanent"; error: string };

export async function curateItem(input: CurateInput): Promise<CurateResult>;
```

내부 호출:

```typescript
const message = await anthropic.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 256,
  system: [{
    type: "text",
    text: SYSTEM_PROMPT, // 카테고리 + JSON 형식 규칙 (~600 토큰)
    cache_control: { type: "ephemeral" }
  }],
  messages: [{ role: "user", content: userMessage }],
});
```

응답 JSON 형식: `{ "summary": string, "category": one of 8 }`. summary 길이 1~200자 검증, category는 `isCurationCategory` 타입 가드. 실패 분류:

- 4xx (400/422 등) 또는 invalid JSON / invalid category → `permanent`
- 429 / 5xx / 네트워크 오류 → `transient`

### `src/lib/curation/process.ts`

```typescript
type ProcessOutcome = "success" | "transient_failure" | "permanent_failure" | "skipped";
export async function processCollectedItem(itemId: string): Promise<ProcessOutcome>;
```

흐름:

1. supabase에서 row 조회. 이미 `processed_at IS NOT NULL`이면 `skipped` 반환.
2. `safeFetch(url)` + `parseOGMeta(body)` → og 메타 (실패해도 빈 메타로 진행).
3. `curateItem({url, memo, ogTitle, ogDescription})` 호출.
4. 결과 반영:
   - 성공 → UPDATE `summary`, `category`, `og_title`, `og_description`, `og_image`, `processed_at = now()`, `last_error = null`. 반환 `success`.
   - transient → UPDATE `processing_attempts = processing_attempts + 1`, `last_error = "transient: <msg>"`. 반환 `transient_failure`.
   - permanent → UPDATE `processing_attempts = processing_attempts + 1`, `last_error = "permanent: <msg>"`. 반환 `permanent_failure`.

서버는 service role 키로 RLS 우회, 단일 사용자 가정에서 자물쇠는 불필요(각 cron 라운드는 단일 인스턴스).

### `src/lib/curation/data.ts`

```typescript
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

export async function getCurationItems(filter: CurationFilter): Promise<CurationItem[]>;
export async function getCategoryCounts(): Promise<Record<CurationFilter, number>>;
```

쿼리 규칙:

- `all` → `processed_at IS NOT NULL ORDER BY processed_at DESC`
- 카테고리 → 위 + `category = $cat`
- `dead-letter` → `processing_attempts >= 5 AND processed_at IS NULL ORDER BY created_at DESC`

`getCategoryCounts`는 위 분류별 카운트를 한 번에 반환(가능하면 `count(*) GROUP BY` 한 번 + dead-letter 카운트 한 번).

### `src/lib/rateLimit/upstash.ts`

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export async function checkCollectLimit(): Promise<
  | { ok: true }
  | { ok: false; retryAfter: number }
>;
```

내부에 두 sliding window를 동일 키 `collect:global`에 적용:

- 60 / 1 hour
- 200 / 1 day

둘 중 하나라도 차단되면 `{ ok: false, retryAfter: <남은 초> }`. 둘 다 통과해야 `{ ok: true }`.

신규 의존성 (package.json):

```
@upstash/ratelimit: ^2
@upstash/redis: ^1
```

### `src/lib/auth/requireCronSecret.ts`

```typescript
export function requireCronSecret(req: Request):
  | { ok: true }
  | { ok: false; response: Response };
```

검증 순서:

1. `Authorization` 헤더가 `Bearer ${CRON_SECRET}`와 timing-safe 일치 → ok.
2. 위가 없거나 불일치하면 401.

`x-vercel-cron` 헤더는 Vercel이 자체 cron에서 자동 주입하지만 타사 트리거에 의해 위조될 가능성을 줄이기 위해 `Authorization` Bearer만 신뢰한다. Vercel cron 등록 시 헤더에 secret 포함하도록 설정.

## 흐름

### Collect 동기 경로

```
[iOS 단축어]
   │ POST /api/collect (Bearer COLLECT_API_KEY)
   ▼
[/api/collect]
  ├─ requireBearer(COLLECT_API_KEY)         → 401 if 실패
  ├─ checkCollectLimit()                     → 429 if 초과
  ├─ URL/memo validation                    → 400 if 부적절
  ├─ duplicate check (user_id, url)         → 200 + duplicate=true
  ├─ INSERT row (summary/category/processed_at = null)
  ├─ processCollectedItem(id) [await, 결과는 무시]
  └─ NextResponse.json(201, {success:true, data})
```

처리 결과는 응답에 영향 없음. 단축어는 항상 "수집 완료"만 보면 된다.

### Cron 경로

```
[Vercel Cron 0 * * * *]
   │ POST /api/curation/process (Authorization: Bearer ${CRON_SECRET})
   ▼
[/api/curation/process]
  ├─ requireCronSecret()                     → 401 if 실패
  ├─ SELECT id FROM collected_items
  │    WHERE processed_at IS NULL
  │      AND processing_attempts < 5
  │      AND is_processed = false
  │    ORDER BY created_at ASC
  │    LIMIT 20
  ├─ for each id (직렬): processCollectedItem(id)
  └─ NextResponse.json(200, {processed, success, transient, permanent})
```

직렬 처리: Anthropic 5xx 폭주 시 동시성으로 손해 키우지 않게.

### 큐레이션 탭 페이지 흐름

```
[/memo?tab=curation]
   │ Server Component
   ▼
[memo/page.tsx]
  ├─ activeTab = "curation"
  ├─ filter = searchParams.cat ?? "all"
  ├─ items = getCurationItems(filter)
  ├─ counts = getCategoryCounts()
  ▼
[CurationTab]
  ├─ chip row: 전체(N) / 8 카테고리(N) / 처리 실패(N) - 0건이면 chip 자체 비표시
  ├─ for item: <CurationCard />
```

`CurationCard` 구조 (디자인 토큰 그대로):

```tsx
<a href={item.url} target="_blank" rel="noopener noreferrer"
   className="bg-surface rounded-card border border-hair shadow-card p-3 mb-3 flex gap-3 active:opacity-80">
  <img src={item.ogImage} className="w-[88px] h-[88px] rounded-input bg-hair-light object-cover" />
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-1.5 mb-1">
      <span className="text-[11px] px-2 py-0.5 bg-primary-soft text-primary rounded-chip font-semibold">
        {item.category}
      </span>
      <span className="text-[11px] text-ink-muted">{relativeTime(item.processedAt)}</span>
    </div>
    <div className="text-[14px] font-bold text-ink line-clamp-1">{item.ogTitle}</div>
    <div className="text-[12px] text-ink-sub line-clamp-2 mt-0.5">{item.summary}</div>
  </div>
  <button className="...">⋯</button>  {/* 시트 열기 */}
</a>
```

dead-letter 카드(`category` null, `last_error` 있음)는 별도 변형:

```tsx
<div className="...border-danger-soft bg-danger-soft/30">
  ⚠ 처리 실패 — 재처리 버튼 + 원본 URL 링크
</div>
```

### Server Actions

`src/app/(main)/memo/curation/actions.ts`

```typescript
export async function updateCurationCategory(
  id: string, category: CurationCategory
): Promise<ActionResult>;

export async function deleteCuration(id: string): Promise<ActionResult>;

export async function reprocessCuration(id: string): Promise<ActionResult>;
// processed_at = null, processing_attempts = 0, last_error = null로 리셋 후
// processCollectedItem(id) 인라인 호출. 결과는 ok에 반영.
```

모두 `requireSession` + 입력 검증 + `revalidatePath("/memo")`.

## 보안

- `/api/collect`: Bearer + timing-safe 비교 (기존). + Upstash rate limit.
- `/api/curation/process`: `requireCronSecret`(Bearer + timing-safe).
- Server Actions: `requireSession` + 입력 검증.
- OG fetch: 기존 `safeFetch` (SSRF 방어 + 5초 타임아웃 + 1MB 상한 + 사설 IP 차단). 변경 없음.
- 카테고리 입력 검증: `isCurationCategory` 가드 + DB의 string 칼럼이지만 Anthropic 출력은 항상 8개 중 하나로 제한, 사용자 수정 액션도 동일 가드.
- `console.error`는 메시지만 (스택 미노출, 기존 패턴).
- Anthropic API 키는 서버 전용 env, 클라이언트 번들에 노출 안 됨.

## 환경변수 / 의존성

### 신규 (이미 Vercel 등록됨, 코드만 참조)

```
CRON_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

`.env.example`에 동일 키 추가.

### 신규 npm 의존성

```
@upstash/ratelimit: ^2
@upstash/redis: ^1
```

### `vercel.json` (없으면 신규 생성)

```json
{
  "crons": [
    { "path": "/api/curation/process", "schedule": "0 * * * *" }
  ]
}
```

Vercel 대시보드에서 cron이 호출 시 `Authorization: Bearer ${CRON_SECRET}` 헤더를 포함하도록 설정. 또는 Vercel Cron이 자체 헤더를 쓴다면 `requireCronSecret` 측에서 `x-vercel-cron-signature` 검증으로 전환 — 구현 시점에 Vercel 문서 확인 후 결정 (둘 다 timing-safe).

## 에러 / 재시도 매트릭스

| 상황 | OG fetch | curate | DB 갱신 | 다음 |
|------|----------|--------|---------|------|
| 정상 | ok | ok | summary/category/og_*/processed_at = now | 큐레이션 탭 표시 |
| OG 실패 | error | (빈 메타로) ok | 위와 동일, og_* = null | 표시됨 |
| curate transient | any | transient | attempts++, last_error = "transient: ..." | 다음 cron 라운드에서 재시도 |
| curate permanent | any | permanent | attempts++, last_error = "permanent: ..." | 다음 cron 라운드에서 재시도(같은 결과 가능) |
| attempts >= 5 | — | — | — | dead-letter, reprocess 액션으로만 깨움 |
| collect rate limit 초과 | — | — | row 미생성 | 429 (`Retry-After` 헤더 포함) |
| cron secret 부적절 | — | — | — | 401 |

## `/api/collect` 응답 코드

- 201 — row 생성 성공 (처리 결과는 응답에 미반영)
- 200 + `{duplicate: true}` — 동일 url 이미 존재 (기존 동작)
- 400 — 잘못된 URL/스킴/memo 길이 초과
- 401 — Bearer 인증 실패
- 429 — rate limit 초과 (`Retry-After: <초>`)
- 500 — DB 오류 (드물게)

## 테스트 전략

기존 vi.hoisted 패턴 그대로. mock 대상: Anthropic SDK, `safeFetch`, supabase, `@upstash/ratelimit`.

| 테스트 파일 | 검증 | 추정 tests |
|------------|------|----|
| `lib/curation/categories.test.ts` | 타입 가드, 8 카테고리 | 4 |
| `lib/curation/curate.test.ts` | mock Anthropic, prompt cache flag, JSON 파싱, invalid category, 4xx vs 5xx 분류 | 8 |
| `lib/curation/process.test.ts` | 성공 경로, OG 실패 fallthrough, transient/permanent attempts++, 이미 processed면 skipped | 8 |
| `lib/curation/data.test.ts` | filter별 query, 카운트 | 5 |
| `lib/rateLimit/upstash.test.ts` | hourly 통과·일 차단 시 차단, 둘 다 통과 시 ok, retryAfter 계산 | 4 |
| `lib/auth/requireCronSecret.test.ts` | 일치/불일치/헤더 누락, timing-safe | 3 |
| `app/api/collect/route.test.ts` | 기존 보강: 201 항상, 429, 인라인 처리 호출 확인 | 5 |
| `app/api/curation/process/route.test.ts` | CRON_SECRET 401, 20개 한도, 결과 집계 JSON | 4 |
| `app/(main)/memo/curation/actions.test.ts` | update/delete/reprocess + requireSession + 카테고리 가드 | 6 |

신규 합산 약 **47 tests**. 기존 98 + 인박스 관련 일부 삭제 후 총 **~140 tests**.

## 검증 (PASS 조건)

- `npm test` 모두 통과 (~140 tests)
- `npm run build` env 없이 성공 (Phase 1.5c 회귀 방지)
- `/memo?tab=curation`이 데이터 0건이어도 빈 상태로 정상 렌더 (placeholder 문구는 카드 리스트 빈 상태로 통일)
- 마이그레이션 SQL을 Supabase SQL Editor에서 실행 → 새 칼럼 + 인덱스 생성
- Vercel 배포 후 cron이 1시간 내에 미처리 큐를 정리 (사용자가 단축어로 1건 보내고 1시간 뒤 큐레이션 탭에 표시되는지 확인)
- Anthropic 콘솔에서 cache_read_input_tokens 발생 확인 (두 번째 호출 이후)

## 위험 / 트레이드오프

- **Anthropic 4.x SDK API 형식이 빠르게 변할 수 있음** — `cache_control`이나 `system` 배열 형식은 Anthropic 공식 SDK 문서를 구현 시점에 한 번 더 확인. 현재 디자인은 SDK 0.87 + 캐싱 GA 가정.
- **`x-vercel-cron-signature` vs Bearer secret** — Vercel Cron의 인증 메커니즘이 갱신될 수 있음. 구현 단계에서 Vercel 문서 확인 후 둘 중 안전한 방식 선택. 일단 명시적 Bearer secret을 default로.
- **단축어 응답 시간** — `/api/collect`가 OG fetch + Anthropic 동기 호출을 포함하므로 평균 3~10초, 최악 30초 이상 걸릴 수 있음. 단축어가 응답을 기다리지 않고 바로 다음 동작하는 패턴이라 UX 영향은 미미하지만, Vercel Serverless Function 기본 타임아웃(Hobby: 10초, Pro: 15초 / 사용자 환경 확인)에 걸리면 인라인 처리가 잘리고 cron이 회수해야 함. `/api/collect`에 `export const maxDuration = 30;` 명시 권장.
- **cron 중복 트리거** — Vercel Cron이 retry로 이중 호출하는 경우 동일 row를 두 인스턴스가 동시에 처리할 가능성. 단일 사용자라 빈도가 극히 낮고, supabase의 atomic UPDATE가 마지막 결과로 수렴함. 추후 `processing_started_at` 락이 필요하면 후속 PR.
- **dead-letter 항목 누적** — Anthropic 한도 도달이나 영구 실패가 누적되면 사용자가 reprocess 액션을 일일이 눌러야 함. 일괄 재처리 버튼은 현 단계 out of scope.

## Out of Scope

- `is_processed` 칼럼 drop 및 레거시 행 cleanup (후속 PR)
- 큐레이션 카드에서 메모 탭으로 이동(원본을 메모로 만들기) 액션
- 일괄 재처리 / 일괄 카테고리 변경
- 검색 기능 (텍스트 검색은 카테고리 필터로 충분)
- 카테고리별 통계 페이지
- iOS 단축어 측 변경 (응답 처리 동일하게 유지)
