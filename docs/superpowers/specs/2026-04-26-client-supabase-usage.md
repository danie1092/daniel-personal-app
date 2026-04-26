# 클라이언트 Supabase 직접 호출 인벤토리 (2026-04-26)

> Phase 1 마이그레이션 대상. RLS 활성화 전 모두 서버 컴포넌트/API route로 이전 필요.

## 임포트 위치

| 파일 | 임포트 | 비고 |
|------|--------|------|
| `src/middleware.ts` | `@/lib/supabase/middleware` | 서버 측, 유지 |
| `src/lib/supabase/server.ts` | `@supabase/ssr` (서버 SSR) | 유지 |
| `src/lib/supabase/client.ts` | `@supabase/ssr` (브라우저 createClient 팩토리) | Phase 1 종료 후 검토 |
| `src/lib/supabase.ts` | `@supabase/ssr` 전역 브라우저 인스턴스 | Phase 1에서 deprecate 또는 제거 |
| `src/app/(main)/home/page.tsx` | `@/lib/supabase` | 브라우저 — 이전 필요 |
| `src/app/(main)/routine/page.tsx` | `@/lib/supabase` | 브라우저 — 이전 필요 |
| `src/app/(main)/memo/page.tsx` | `@/lib/supabase/client` | 브라우저 — 이전 필요 |
| `src/app/(main)/diary/page.tsx` | `@/lib/supabase` | 브라우저 — 이전 필요 |
| `src/app/(main)/budget/page.tsx` | `@/lib/supabase` | 브라우저 — 이전 필요 |
| `src/app/(auth)/login/page.tsx` | `@/lib/supabase/client` | 브라우저 — auth.signIn은 유지 가능 |
| `src/components/RoutineParty.tsx` | `@/lib/supabase/client` | 브라우저 — 이전 필요 |
| `src/hooks/useTamagotchi.ts` | `@/lib/supabase` | 브라우저 — Phase 1에서 폐기 |

## 호출 패턴 (테이블별)

### memo_entries
- **Read**: `(main)/memo/page.tsx` `fetchMemos()` (line 62-69)
- **Write (insert)**: `(main)/memo/page.tsx` `handleSubmit()` (line 156)

### diary_entries
- **Read**: `(main)/home/page.tsx` (line 66 — 월 일기 날짜 set)
- **Read**: `(main)/diary/page.tsx` (line 50-51)
- **Write (upsert)**: `(main)/diary/page.tsx` (line 83)

### budget_entries
- **Read**: `(main)/home/page.tsx` (line 71-75 — 월 지출 합산)
- **Read/Write**: `(main)/budget/page.tsx` 다수 (insert line 203, 272 / update 314 / delete 331, 494)

### salary_entries
- **Read/Write**: `(main)/budget/page.tsx` (월급 입력 흐름, 본 인벤토리 시점에 line 정확 확인 필요)

### routine_items
- **Read**: `(main)/home/page.tsx` (line 58 — count head)
- **Read/Write**: `(main)/routine/page.tsx` (insert 260 / update 273, 293-294 / delete 282)

### routine_checks
- **Read**: `(main)/home/page.tsx` (line 60-64 — count head)
- **Read/Write**: `(main)/routine/page.tsx` (line 221, 226 — fetch + upsert)

### collected_items
- **Read**: `(main)/memo/page.tsx` `fetchInboxCount`, `openInbox` (line 71-93)
- **Write (update is_processed)**: 서버 라우트 `/api/inbox/save`에서만 — 안전

### tamagotchi_state
- `useTamagotchi.ts` — Phase 1에서 hook 폐기, 테이블 drop

### auth
- `(auth)/login/page.tsx` `supabase.auth.*` — 브라우저 클라이언트로 유지(Auth는 anon key 흐름이 정상)

## Phase 1 마이그레이션 가이드

### 일반 원칙
- **Read 경로**: Server Component (`page.tsx`를 default async로) 또는 `/api/<resource>/route.ts` GET
- **Write 경로**: Server Action (`"use server"`) 또는 `/api/<resource>/route.ts` POST/PATCH/DELETE
- **Auth 호출**(login, signOut)은 브라우저 클라이언트로 유지
- 마이그레이션 완료 후 `supabase_migration_phase0_rls.sql` 실행 → RLS 활성화
- `src/lib/supabase.ts`(전역 브라우저 인스턴스)는 Phase 1 종료 시점에 deprecate 또는 제거

### 우선순위 (Phase 1 진입 시 권장 순서)
1. `(main)/memo/page.tsx` — 가장 변경 많음(채집함 흐름 포함). 디자인 리노베이션과 함께 처리
2. `(main)/budget/page.tsx` — write가 많음, Server Action으로
3. `(main)/diary/page.tsx` — upsert 단일 흐름, 단순
4. `(main)/routine/page.tsx` — 다단계 mutation, Server Action 다수 필요
5. `(main)/home/page.tsx` — 모두 read만, Server Component로 가장 쉬움
6. `useTamagotchi.ts` + `RoutineParty.tsx` + `(tamagotchi)/...` — 일괄 폐기

### RLS 활성화 절차 (Phase 1 완료 후)
1. 모든 클라이언트 직접 호출이 서버 측으로 이전됐는지 확인
2. PITR 백업 시점 기록
3. `psql` 또는 Supabase SQL Editor에서 `supabase_migration_phase0_rls.sql` 실행
4. anon key로 직접 `from('memo_entries').select()` 호출해 401 또는 빈 결과 확인
5. 인증된 세션으로 페이지 접근해 정상 동작 확인
