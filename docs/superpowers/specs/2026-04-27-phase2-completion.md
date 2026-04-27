# Phase 2 완료 보고 (2026-04-27)

**브랜치**: `phase2-curation-automation`
**최종 검증**: `npm test` 144 PASS, `npm run build` env 없이 성공.

## 적용된 변경

### 신규 모듈 (lib/)
- `src/lib/curation/categories.ts` (+ test, 5 tests) — 8개 카테고리 const + 타입 가드
- `src/lib/curation/curate.ts` (+ test, 8 tests) — Anthropic Haiku 4.5 + ephemeral cache, 12개 few-shot 예시 포함
- `src/lib/curation/process.ts` (+ test, 8 tests) — OG fetch → curate → DB 갱신 오케스트레이션
- `src/lib/curation/data.ts` (+ test, 5 tests) — filter별 list + 카운트
- `src/lib/rateLimit/upstash.ts` (+ test, 4 tests) — sliding window 60/h + 200/d on `collect:global`
- `src/lib/auth/requireCronSecret.ts` (+ test, 4 tests) — timing-safe Bearer

### API 라우트
- `src/app/api/curation/process/route.ts` (+ test, 4 tests) — Vercel Cron 진입점, 직렬 20개 배치
- `src/app/api/collect/route.ts` (수정 + test, 6 tests) — Upstash rate limit + 인라인 큐레이션 (베스트-에포트 201)

### UI (`src/app/(main)/memo/curation/`)
- `actions.ts` (+ test, 6 tests) — updateCurationCategory / deleteCuration / reprocessCuration
- `CurationTab.tsx` — chip 필터 + 카드 리스트 + 빈 상태
- `CurationCard.tsx` — 88×88 썸네일 + 카테고리 chip + summary + ⋯ 메뉴 + dead-letter 변형
- `CurationEditSheet.tsx` — 카테고리 변경/삭제/재처리 바텀시트

### 페이지 통합
- `src/app/(main)/memo/page.tsx` — 헤더에서 InboxButton 제거, `?tab=curation&cat=...` 파라미터 처리, CurationTab 통합

### 폐기 (인박스 흐름, Phase 2 자동화로 대체)
- 삭제: `InboxButton.tsx`, `InboxSheet.tsx`, `MemoCurationPlaceholder.tsx`
- 제거: `organizeInbox`, `saveInboxGroups`, `validateGroup`, `fetchOGMeta` from `memo/actions.ts`
- 제거: `getInboxItems`, `getInboxCount`, `CollectedItem` from `lib/memo/list.ts`
- 관련 테스트 케이스 정리

### 인프라
- `vercel.json` 신규 — `0 * * * *` cron 등록
- `supabase_migration_phase2_curation.sql` — `collected_items` 8 칼럼 + 2 부분 인덱스
- `package.json` — `@upstash/ratelimit ^2`, `@upstash/redis ^1` 추가

## 검증 결과

| 항목 | 상태 |
|------|------|
| `npm test` | ✅ 144 tests / 28 files PASS (Phase 1.5c 98 + Phase 2 신규 46) |
| `npm run build` env 없이 | ✅ |
| `/api/curation/process` route 등록 | ✅ build 결과에 표시됨 |
| 인박스 코드/테스트 잔존 | ❌ 모두 제거됨 |
| `/memo?tab=curation` 빈 상태 처리 | ✅ "아직 큐레이션된 항목이 없어요" 안내 |
| Anthropic 호출 보안 | ✅ 서버 전용, system prompt에 cache_control: ephemeral |
| Server Actions 보안 | ✅ requireSession + 입력 검증 + console.error 메시지만 |

## 사용자 후속 작업

Phase 2가 실 동작하려면 Vercel 배포 전후에 다음 단계 필요:

1. **Supabase 마이그레이션 실행**
   - Dashboard → SQL Editor → `supabase_migration_phase2_curation.sql` 전체 붙여넣기 → Run
   - 결과: `collected_items`에 8개 칼럼 + 2개 부분 인덱스 추가

2. **Vercel 환경변수 확인** (Phase 0에서 등록됨, 재확인만)
   - `CRON_SECRET`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

3. **Vercel Cron 인증 헤더 설정**
   - Vercel Cron이 `/api/curation/process` 호출 시 `Authorization: Bearer ${CRON_SECRET}` 헤더를 보내도록 콘솔에서 확인
   - 필요 시 `vercel.json`의 `crons` 항목에 헤더 옵션 추가

4. **운영 관찰**
   - 단축어로 1건 보내고 5~10초 안에 `/memo?tab=curation`에 표시되는지
   - 실패 시 1시간 뒤 cron이 회수하는지 (Vercel Logs)
   - Anthropic 콘솔에서 `cache_read_input_tokens` 발생하는지 (두 번째 호출 이후)
   - 월 사용량이 $5 한도 안에서 유지되는지

## 알려진 이슈 / 트레이드오프

- **`is_processed` 칼럼 잔존** — 레거시 `organizeInbox`로 메모 이전된 행들의 marker. 큐레이션 탭/cron 모두 명시적으로 제외하므로 잔존이 안전. 후속 PR에서 칼럼 + 잔존 행 cleanup 가능.
- **`x-vercel-cron-signature` 미사용** — 명시적 Bearer secret만 신뢰. Vercel Cron 인증 메커니즘이 갱신되면 헬퍼 보강 필요.
- **dead-letter 일괄 재처리 없음** — 실패 항목이 누적되면 사용자가 카드별 ⋯ → 재처리 버튼 일일이 눌러야 함. 일괄 액션은 후속 PR.
- **카드에서 메모 탭으로 옮기기 액션 미구현** — 큐레이션은 in-place 주석. 메모로 만들고 싶으면 별도 액션 추가 필요(out of scope).
- **Pre-existing lint error** — `src/app/(main)/budget/DonutChart.tsx`에 Next.js 16 react-hooks/immutability 에러 1건. Phase 2와 무관, build/test에는 영향 없음. 후속 정리 권장.

## 커밋 흐름 (16 commits, Task 0~15)

```
cefe41a chore(phase2): upstash 의존성 + vercel cron + 마이그레이션 SQL
8ad5bce feat(curation): 8개 카테고리 const + 타입 가드
3b1020c feat(auth): requireCronSecret (timing-safe Bearer)
8301b0f feat(rateLimit): Upstash 60/h + 200/d on collect:global
4eb0497 feat(curation): Anthropic Haiku 4.5 + ephemeral cache + 8개 분류
6d2d400 feat(curation): processCollectedItem orchestration (OG → curate → DB)
4b233c2 feat(curation): list/count 헬퍼 (filter별)
8ccba2a feat(api): /api/curation/process cron route (20개 배치)
287bb81 feat(api): /api/collect rate limit + 인라인 큐레이션 (201 베스트-에포트)
68c76da feat(curation): Server Actions (updateCategory/delete/reprocess)
fded04f feat(curation): CurationCard (88x88 썸네일 + 텍스트 + ⋯)
b860b50 feat(curation): EditSheet (카테고리 변경/삭제/재처리)
989160b feat(curation): CurationTab (chip 필터 + 카드 리스트 + 시트)
ed1681a refactor(memo): 인박스 폐기 + page.tsx 큐레이션 탭 통합
(+ 이 완료 보고)
```
