# Phase 0 완료 보고 (2026-04-26)

**브랜치**: `phase0-security-baseline`
**커밋 수**: 21 (spec 2 + plan 1 + 구현 18)
**최종 검증**: `npm test` 29/29 PASS, `npm run build` 성공

## 적용된 변경

### 코드 (`src/`)
- **Vitest 인프라** + 5개 신규 보안 모듈 (29 tests):
  - `src/lib/auth/timingSafeEqual.ts` (6 tests)
  - `src/lib/auth/requireBearer.ts` (5 tests)
  - `src/lib/auth/requireSession.ts` (3 tests, vi.mock)
  - `src/lib/og/safeFetch.ts` (10 tests, SSRF 방어)
  - `src/lib/og/parseMeta.ts` (5 tests)
- **API route 인증 표준화**:
  - `/api/collect` — `requireBearer` (timing-safe) + URL/memo 검증 + 스킴 화이트리스트
  - `/api/inbox/save` — `requireSession` + 입력 검증
  - `/api/inbox/organize` — `requireSession` + `safeFetch` + `parseOGMeta`
- **`next.config.ts`** — 보안 헤더 5종 + API Cache-Control + PWA runtime cache 정책

### 데이터베이스
- **RLS 활성화** (Supabase Advisor 0 critical 달성):
  - `memo_entries`, `diary_entries`, `budget_entries`, `salary_entries`, `routine_items`, `routine_checks`, `tamagotchi_state` → `auth.uid() IS NOT NULL`
  - `collected_items` → 소유자 격리(`auth.uid()::text = user_id::text`)
- **`routine_entries` drop** (0 rows 레거시 테이블)
- **PITR 활성화** (Pro 플랜, retention 7일)

### 인프라 / 운영
- `COLLECT_API_KEY` 회전 + 단축어 갱신 완료
- `CRON_SECRET`, `BUDGET_API_KEY`, `BUDGET_HMAC_SECRET` Vercel 등록 완료 (Phase 2/3 사전 준비)
- Anthropic monthly cost limit `$5/month` 설정 완료
- gitleaks 시크릿 스캔 → clean (55 commits, 0 findings)

### 문서
- `docs/superpowers/specs/2026-04-26-phase0-security-baseline-design.md` — Phase 0 spec
- `docs/superpowers/plans/2026-04-26-phase0-security-baseline.md` — implementation plan
- `docs/superpowers/specs/2026-04-26-phase0-gitleaks-report.md` — gitleaks 결과
- `docs/superpowers/specs/2026-04-26-client-supabase-usage.md` — Phase 1 마이그레이션 인벤토리
- `docs/operations/token-rotation.md` — 토큰 회전 절차
- `docs/operations/disaster-recovery.md` — DR 절차
- `docs/operations/cost-controls.md` — 비용 통제 + tax ID TODO
- `.env.example` — Phase 2/3 변수 사전 정의

## 검증 결과

| 항목 | 상태 |
|------|------|
| `npm test` (Vitest) | ✅ 5 files / 29 tests PASS |
| `npm run build` (Next.js) | ✅ 16 static + 4 dynamic routes |
| ESLint | ✅ 통과 |
| Supabase Advisor (Critical) | ✅ 0건 (이전 4건 → 0건) |
| gitleaks 히스토리 스캔 | ✅ 0 findings |
| 기존 페이지 작동 (`/home /memo /diary /budget /routine`) | ✅ 정상 |
| iPhone 단축어 인스타 적재 | ✅ 새 토큰으로 정상 |

## 보안 개선 결과

| 항목 | Before | After |
|------|--------|-------|
| `/api/inbox/*` 인증 | 무인증 | 세션 검증 |
| `/api/collect` 토큰 비교 | `===` (timing-attackable) | `crypto.timingSafeEqual` |
| OG 크롤링 SSRF 방어 | 없음 | private IP / loopback / link-local / IPv6 / IPv4-mapped 차단, 1MB cap, 5s timeout, redirect IP 재검증 |
| URL 입력 검증 | 없음 | 길이 + 스킴 + malformed |
| HSTS | 없음 | max-age=63072000 + preload |
| X-Frame-Options | 없음 | DENY |
| Cache-Control on `/api/*` | 없음 | no-store |
| PWA SW가 `/api/*` 캐시 | 가능 | NetworkOnly |
| Anthropic 비용 상한 | 없음 | $5/month |
| Supabase RLS | 미설정(Advisor Critical 4건) | 모든 테이블 적용 |
| Supabase 백업 | 미확인 | PITR 7일 |
| 시크릿 회전 | 없음 | `COLLECT_API_KEY` 회전 |

## Phase 1 진입 전 체크리스트

- [x] Phase 0 모든 변경 머지
- [ ] Phase 1 spec/plan 작성 (디자인 리노베이션 + 다마고치 폐기 + 홈 재구성)
- [ ] 새 worktree 또는 새 브랜치
- [ ] 마이그레이션 순서: 클라이언트 호출 이전 → 다마고치 코드 drop → tamagotchi_state 테이블 drop
- [ ] PITR 켜진 상태에서 마이그레이션 진행

## 알려진 미해결 (Phase 1+로 이연)

| 항목 | 단계 |
|------|------|
| 클라이언트 직접 supabase 호출 → 서버 컴포넌트/API 마이그레이션 | Phase 1 |
| 다마고치 코드 (`(tamagotchi)/...`, `useTamagotchi.ts`, `RoutineParty.tsx`?) + 테이블 drop | Phase 1 |
| sprites 페이지 폐기 | Phase 1 |
| `claude-sonnet-4` → Haiku 4.5 + 프롬프트 캐싱 교체 | Phase 2 |
| `/api/curation/process` 신설 + Vercel Cron | Phase 2 |
| Upstash Ratelimit 통합 | Phase 2 |
| 맥미니 chat.db 폴링 + `/api/budget/auto` (HMAC + Idempotency) | Phase 3 |
| `next.config.ts` CSP (report-only → enforce) | Phase 1 후반 |
| Supabase tax ID 등록 (cost-controls.md TODO) | 별건, 비보안 |

## 코드 품질 follow-up (선택)

리뷰에서 식별된 비차단 follow-up:
- `requireSession` catch 블록 dev-mode 로깅 추가
- `/api/*` JSON parse 실패를 500 → 400으로 (collect/save 둘 다)
- `safeFetch` Promise.all 동시성 cap (`p-limit` 8)
- Anthropic 응답 JSON 파싱을 try `JSON.parse(text)` 우선 → fallback regex
- `public/sw.js` + `public/workbox-*.js` 빌드 산출물을 `.gitignore`에 추가 (매 빌드 후 dirty 발생)

이 항목들은 Phase 1~3 진행하면서 자연스럽게 처리.

## 다음 단계

1. Phase 0 브랜치를 main에 머지하거나 PR로 정리
2. Phase 1 brainstorming → design doc → implementation plan 작성
   - 토스 스타일 디자인 토큰 + 컴포넌트
   - 다마고치/sprites 코드+DB drop
   - 홈 재구성 (소비 KPI 메인 + 메모/큐레이션/일기/루틴 위젯)
   - BottomNav 재디자인 (홈/메모/큐레이션/일기/루틴 5탭, 가계부는 홈 카드 진입)
   - 클라이언트 supabase 호출을 Server Components/Server Actions로 이전
3. Phase 1 완료 후 Phase 2 (인스타 큐레이션 자동화)
4. Phase 3 (SMS 가계부 자동입력)
