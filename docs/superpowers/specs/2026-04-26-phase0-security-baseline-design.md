# Phase 0 — 보안 베이스라인

- **작성일**: 2026-04-26
- **상태**: Draft (검토 대기)
- **범위**: `daniel-personal-app` 레포 (개인앱)
- **선행 조건**: 없음
- **후속**: Phase 1(디자인 리노베이션) → Phase 2(인스타 큐레이션 자동화) → Phase 3(SMS 가계부 자동입력)

## 배경

기존 개인앱 코드베이스에 새 기능(자동 큐레이션, SMS 자동입력)을 얹기 전에, 이미 존재하는 보안 취약점부터 잡는다. 각 Phase에서 새 기능에 추가될 인증/검증 패턴을 한곳에 모아 표준화한다.

## 현재 상태에서 확인된 위험

| # | 항목 | 심각도 | 근거 |
|---|------|--------|------|
| 1 | `/api/inbox/save`, `/api/inbox/organize` 무인증 | 🔴 | 코드 직접 확인. Bearer/세션 검증 없음. Anthropic 호출을 외부에서 트리거 가능 |
| 2 | `middleware.ts`가 `/api/*` 전체를 인증 매처에서 제외 | 🔴 | `src/lib/supabase/middleware.ts:35` — `!path.startsWith('/api')` |
| 3 | Supabase RLS 정책 미설정(추정) | 🔴 | `supabase_schema.sql`에 RLS 정책 없음. 클라이언트에서 anon key로 직접 `supabase.from()` 호출 다수 |
| 4 | OG 메타 fetch에 SSRF 방어 없음 | 🟡 | `src/app/api/inbox/organize/route.ts` `fetchOGMeta()` |
| 5 | 토큰 비교가 일반 `===` (timing attack) | 🟡 | `src/app/api/collect/route.ts` |
| 6 | Git 히스토리 시크릿 노출 여부 미확인 | 🟡 | 점검 필요 |
| 7 | 보안 헤더(HSTS, CSP, X-Frame-Options 등) 미설정 | 🟡 | `next.config.ts`에 `headers()` 없음 |
| 8 | API 응답에 `Cache-Control: no-store` 미적용 | 🟡 | CDN/PWA 캐싱 가능성 |
| 9 | Anthropic API 비용 상한선 미설정 | 🟡 | 콘솔 설정 필요 |
| 10 | next-pwa runtime cache 정책 점검 안 됨 | 🟡 | `/api/*` 캐시될 가능성 |

## 목표

1. 기존 위험 #1~#10을 모두 해결하거나 명시적으로 받아들임
2. Phase 1~3에서 사용할 **공통 보안 패턴 라이브러리**를 마련
3. 단일 사용자 환경에서 **방어 깊이(defense in depth)**: 한 단계가 뚫려도 다음 단계가 막아주는 구조

## 비목표

- 멀티 사용자 지원 (단일 사용자 가정 유지)
- 외부 침투 테스트나 정식 보안 감사
- WAF/IDS 같은 외부 보안 인프라 도입

## 결정 사항 (사용자 컨펌됨)

- 자동화 트리거: collect 동기 + 1시간 cron 보완 (Phase 2에서 구현)
- 모델: Claude **Haiku 4.5** + 프롬프트 캐싱
- SMS 자동입력: 맥미니 chat.db 폴링
- SMS API 인증: **Bearer + HMAC + Idempotency-Key + 타임스탬프** 4단 방어
- Rate limit: **Upstash Ratelimit (분산 정확)** + Anthropic 콘솔 monthly cost limit
- 다마고치 코드 + DB 테이블 + sprites 모두 폐기 (Phase 1에서 실시)
- `COLLECT_API_KEY` 회전 (Phase 0에 포함)

## 작업 항목

### Task 0-1. Supabase RLS 정책 점검 및 적용

**현재 상태**: 추정상 RLS 미설정. 클라이언트에서 anon key로 `memo_entries`, `diary_entries`, `budget_entries`, `routine_*` 등을 직접 read/write 함.

**문제**: anon key가 클라이언트 번들에 포함되므로(NEXT_PUBLIC_*) 노출 시 누구나 데이터 접근 가능.

**조치**:
1. Supabase 대시보드에서 모든 테이블의 RLS 활성화
2. 단일 사용자 정책: 인증된 세션만 read/write 허용 (`auth.uid() IS NOT NULL`)
3. 다마고치 관련 테이블(`tamagotchi_state`)은 **Phase 1에서 drop**하므로 정책 생략
4. 마이그레이션 파일: `migrations/2026-04-26-rls-policies.sql`

**RLS 정책 예시**:
```sql
ALTER TABLE memo_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON memo_entries
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
-- (collected_items는 user_id 컬럼이 있으므로 auth.uid()::text = user_id::text 정책 적용)
```

`collected_items` 테이블은 `user_id` 컬럼이 있으므로 사용자 격리 정책 적용:
```sql
CREATE POLICY "owner_only" ON collected_items
  FOR ALL USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);
```

서버 라우트는 service role key로 RLS를 우회하므로 영향 없음.

### Task 0-2. `/api/inbox/*` 세션 인증 추가

**현재 상태**: 인증 없음.

**조치**:
1. `src/lib/auth/requireSession.ts` 헬퍼 작성 (Supabase SSR로 세션 검증)
2. `src/app/api/inbox/save/route.ts` 및 `organize/route.ts` 진입점에서 `await requireSession()` 호출, 미인증 시 401
3. 세션이 있는 사용자만 자기 데이터에 접근. 단일 사용자라도 명시적 검증

```typescript
// src/lib/auth/requireSession.ts
import { createServerClient } from "@/lib/supabase/server";
export async function requireSession() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  return { ok: true as const, user };
}
```

### Task 0-3. `middleware.ts`에서 `/api/*` 매처 정책 재설계

**현재**: `!path.startsWith('/api')`로 미들웨어가 API를 통째로 건너뜀.

**조치**: 매처는 그대로 두되(API는 자체 인증 사용), 명시적으로 인증이 필요 없는 API와 토큰 인증이 필요한 API를 구분하도록 주석 명확화. **각 API route에서 인증을 명시적으로 호출**하는 패턴으로 통일.

| API route | 인증 방식 |
|-----------|----------|
| `/api/collect` | Bearer `COLLECT_API_KEY` (timing-safe) |
| `/api/inbox/save` | 세션 (`requireSession`) |
| `/api/inbox/organize` | 세션 (`requireSession`) — Phase 2에서 cron 모드도 추가 |
| `/api/curation/process` (Phase 2) | Cron secret + 내부 호출만 |
| `/api/budget/auto` (Phase 3) | Bearer + HMAC + Idempotency + 타임스탬프 |

### Task 0-4. 토큰 비교 timing-safe 처리

**조치**: `src/lib/auth/timingSafeEqual.ts` 헬퍼 작성, `crypto.timingSafeEqual` 기반. Bearer 토큰 검증 시 항상 사용.

```typescript
import { timingSafeEqual } from "node:crypto";
export function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
```

### Task 0-5. SSRF 방어 (OG 크롤링)

**조치**: `src/lib/og/safeFetch.ts` 작성:
- 스킴 화이트리스트: `http`, `https`만
- DNS 해석 후 IP 검사: 사설 대역(`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`) 차단
- 응답 크기 상한: 1MB (`Content-Length` 사전 검증 + 스트림 카운트)
- 타임아웃: 5초 (기존 유지)
- 리다이렉트: `redirect: "manual"` + 최대 3회까지 재귀, 각 단계마다 IP 재검증
- User-Agent: `daniel-personal-app/1.0 (+og-fetch)`

### Task 0-6. `next.config.ts` 보안 헤더

```typescript
async headers() {
  return [
    {
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
    {
      source: "/api/:path*",
      headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
    },
  ];
}
```

CSP는 `report-only`로 시작 (Phase 1 디자인 작업 후 안정되면 enforce 전환).

### Task 0-7. Git 히스토리 시크릿 스캔

**조치**:
1. `gitleaks detect --source . --log-opts="--all"` 실행
2. 발견되면: 히스토리 재작성 검토 (BFG Repo-Cleaner) — 단, 공개 레포라면 즉시 토큰 회전이 더 우선
3. 결과를 `docs/superpowers/specs/2026-04-26-phase0-gitleaks-report.md`에 기록

### Task 0-8. 토큰 회전

**대상**:
- `COLLECT_API_KEY` (인스타 단축어용) — 새 키 생성, Vercel 환경변수 업데이트, 단축어 측 키 교체

**미실시(검토 후)**:
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase 대시보드에서 회전 가능, 노출 의심 시
- `ANTHROPIC_API_KEY` — Anthropic 콘솔에서 회전, 노출 의심 시

회전 절차 문서: `docs/operations/token-rotation.md`에 추가 (단축어 측 갱신 방법 포함)

### Task 0-9. `.env.example` 정비

새 항목 포함, 값은 빈 칸:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
COLLECT_API_KEY=
DEFAULT_USER_ID=
# Phase 2에서 사용
CRON_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
# Phase 3에서 사용
BUDGET_API_KEY=
BUDGET_HMAC_SECRET=
```

### Task 0-10. next-pwa runtime cache 점검

**조치**: `next.config.ts`의 `next-pwa` `runtimeCaching` 정책에서 `/api/*` 명시적 제외. 인증 필요한 페이지(`/home`, `/memo` 등)는 `NetworkFirst`로 두되 `cacheableResponse`로 200대만 캐시.

### Task 0-11. Supabase 자동 백업 확인

**조치**: Supabase 대시보드에서 일일 자동 백업 활성화 여부 확인. PITR(Point-in-Time Recovery)은 Pro 플랜이 필요하므로 무료 플랜이면 daily backup만 확인하고 결과 기록.

### Task 0-12. Anthropic 콘솔 monthly cost limit

**조치**: Anthropic Console → Limits → Monthly cost limit을 **$5/month**로 설정. 임계 80%/100% 알림 이메일 활성화.

### Task 0-13. 클라이언트 직접 supabase 호출 인벤토리

**조치**: 단순 인벤토리만 만들고 실제 마이그레이션은 Phase 1에서 진행.
- 결과 파일: `docs/superpowers/specs/2026-04-26-client-supabase-usage.md`
- 각 페이지/컴포넌트에서 `from "@/lib/supabase/client"` 사용 위치 + 어떤 테이블을 read/write 하는지 표로 정리

## 공통 보안 패턴 라이브러리 (산출물)

Phase 1~3에서 공통 사용:

```
src/lib/auth/
  requireSession.ts        # 세션 인증 (서버 컴포넌트/API route)
  requireBearer.ts         # Bearer 토큰 검증 (timing-safe)
  requireCronSecret.ts     # Vercel Cron 헤더 검증 (Phase 2)
  requireSignedRequest.ts  # Bearer + HMAC + Idempotency + 타임스탬프 (Phase 3)
  timingSafeEqual.ts
src/lib/og/
  safeFetch.ts             # SSRF 방어 fetch
src/lib/rateLimit/
  upstash.ts               # Upstash Ratelimit 클라이언트 (Phase 2부터 사용)
```

## 검증

각 Task 별 PASS 조건:

- 0-1: Supabase 대시보드에서 모든 테이블 RLS 활성화 확인 + anon key로 직접 `from('memo_entries').select()` 시 빈 결과 또는 401
- 0-2: 미인증 상태에서 `curl /api/inbox/save` 호출 시 401
- 0-4: 잘못된 토큰 길이로 비교해도 응답 시간이 정답 길이와 동일 (정성 확인)
- 0-5: `curl localhost`나 `127.0.0.1`을 collect로 보내도 OG fetch 차단
- 0-6: `curl -I https://daniel-personal-app.vercel.app/` 응답 헤더에 HSTS, X-Frame-Options 포함
- 0-7: gitleaks 보고서 깨끗 또는 발견 항목 모두 회전 완료
- 0-12: Anthropic 콘솔에서 limit $5 설정 스크린샷
- 모든 변경 후 `npm run build` 성공 + `/login`, `/home`, collect API 정상 동작

## 위험 / 트레이드오프

- **RLS 활성화 시 클라이언트 직접 호출 페이지가 깨질 수 있음** → Task 0-13의 인벤토리를 참고해 Phase 1에서 서버 컴포넌트로 이전. Phase 0 단독으로 RLS만 켜면 페이지가 작동 안 할 수 있어, **RLS는 정책 SQL 작성·테스트만 하고 실 활성화는 Phase 1과 함께**
- **gitleaks 발견 시 작업 범위 확대 가능성** → 발견되면 그 범위 안에서 추가 회전 + 사용자 보고
- **Supabase 무료 플랜의 daily backup 한계** → PITR 없으면 사고 시 최대 24시간 데이터 손실 가능. 사용자에게 보고하고 수용 여부 확인

## 환경변수 변경 요약

신규 추가 (실제 값은 Vercel 콘솔):
- `CRON_SECRET` — Phase 2에서 사용 (Phase 0 시점에 생성·등록만)
- `BUDGET_API_KEY`, `BUDGET_HMAC_SECRET` — Phase 3에서 사용 (Phase 0 시점에 생성·등록만)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — Phase 2에서 사용

회전:
- `COLLECT_API_KEY` — 즉시 (단축어 갱신 포함)

## Out of Scope (Phase 1~3로 이연)

- 클라이언트 supabase 호출 → 서버 컴포넌트/API 마이그레이션 (Phase 1)
- RLS 정책 실 활성화 (Phase 1, 마이그레이션과 함께)
- 다마고치/sprites 코드·DB drop (Phase 1)
- Vercel Cron 등록 + `/api/curation/process` 구현 (Phase 2)
- Upstash Ratelimit 코드 통합 (Phase 2)
- 맥미니 chat.db 폴링 스크립트 + `/api/budget/auto` (Phase 3)
