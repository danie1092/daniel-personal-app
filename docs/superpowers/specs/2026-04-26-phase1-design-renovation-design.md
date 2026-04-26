# Phase 1 — 디자인 리노베이션 + 다마고치 폐기 + 홈 재구성

- **작성일**: 2026-04-26
- **상태**: Draft (검토 대기)
- **범위**: `daniel-personal-app` 레포
- **선행 조건**: Phase 0 (보안 베이스라인) 완료 — main에 머지됨
- **후속**: Phase 1.5 (메모/가계부/일기/루틴 페이지 리노베이션) → Phase 2 (큐레이션 자동화) → Phase 3 (SMS 가계부 자동입력)

## 배경

Phase 0에서 보안 베이스라인을 잡았다. 이제 사용자가 매일 보는 인터페이스를 **토스/지점앱 스타일**로 통일하고, 더 이상 사용하지 않는 다마고치 컨셉을 코드/DB에서 정리한다. 페이지별 본격 리노베이션은 Phase 1.5로 분리해 PR 크기와 리스크를 통제한다.

사용자 의도:
- 토스 UI의 깔끔함을 따라가고 싶다 ("귀여운 것보다 완성도 높은 게 더 잘 쓰게 된다")
- 다마고치는 다시 안 쓸 것 — 코드/DB 모두 폐기
- 홈은 매일 처음 보는 곳이라 "가장 신경 써야 할 정보"만 큰 글씨로 노출 (총지출 경계, 빠른메모, 남은 루틴)

## 목표

1. 글로벌 디자인 시스템을 지점앱(토스 스타일) 토큰으로 교체
2. 다마고치/sprites 코드와 DB를 모두 폐기 (Advisor 0 critical 유지)
3. BottomNav를 5탭(홈/가계부/메모/일기/루틴)으로 재구성, Solid 아이콘 스타일
4. 홈 페이지를 새 디자인으로 재구성 (KPI 카드 + 빠른메모 + 루틴 위젯)
5. 메모 페이지에 [메모|큐레이션] 탭 분기 추가 (큐레이션은 placeholder만)
6. 홈 페이지를 Server Components 패턴으로 작성 (Phase 1.5의 페이지별 마이그레이션 모범 사례)

## 비목표 (Phase 1.5+로 이연)

- 메모/가계부/일기/루틴 페이지의 토스 스타일 리노베이션 (Phase 1.5)
- 메모/가계부/일기/루틴 페이지의 클라이언트 supabase 호출 → Server Components 마이그레이션 (Phase 1.5에서 페이지 재작성 시 함께)
- 가계부 카테고리 13개 색상 토큰 (Phase 1.5)
- 큐레이션 자동화 백엔드 (`/api/curation/process`, cron) — Phase 2
- SMS 가계부 자동입력 — Phase 3

## 결정 사항 (사용자 컨펌됨)

- **디자인 토큰**: 지점앱 토큰 1:1 차용 (Pretendard, primary `#2E6FF2`, ink/hair/bg2/surface, 라디우스, 그림자 모두 동일). `success` 토큰만 `#22C55E`로 교체 (홈 루틴 위젯과 통일)
- **BottomNav**: 5탭 = 홈 / 가계부 / 메모 / 일기 / 루틴. **큐레이션은 메모 페이지 안의 두 번째 탭**. 가계부 진입은 nav 1티어 (사용자가 자주 보는 곳). 아이콘 스타일은 **Solid (항상 채움, 활성만 색 변화)**
- **홈 위젯 구성**: KPI 카드 → 메모(빠른메모 input + 최근 2-3) → 루틴(남은 chip + 진행률 바)
- **다마고치 폐기 범위**: 라우트 그룹 `(tamagotchi)/`, `useTamagotchi.ts`, `RoutineParty.tsx`, `(main)/sprites/`, `public/tamagotchi/`, `public/sprites/`, DB `tamagotchi_state` 테이블 drop
- **메모 페이지 탭 분기**: Phase 1엔 [메모 | 큐레이션] 탭 헤더만 추가. 메모 탭 내부 UI는 기존 그대로 두고 Phase 1.5에서 토스풍으로 재작성. 큐레이션 탭은 placeholder
- **큐레이션 placeholder**: "Phase 2에서 자동 수집 시작" 안내 + 카테고리 chip 8개(음식·카페/여행/패션/운동/인테리어/영감/정보·꿀팁/기타) 비활성 미리보기. 기능 동작 X
- **Server Components 마이그레이션 전략**: Phase 1엔 새로 만드는 home 페이지만 Server Components. 나머지 페이지(메모/가계부/일기/루틴)는 Phase 1.5에서 페이지별 재작성 시 함께 변환

## 작업 항목

### Task 1-1. 디자인 토큰 시스템 교체

**현재**: `globals.css`에 'Press Start 2P' 픽셀 폰트 전역 + 임의 색상.

**조치**:
1. `globals.css` 재작성:
   - Pretendard Variable 폰트 import (지점앱과 동일 CDN)
   - CSS 변수: `--bg`, `--surface`, `--ink`, `--ink-sub`, `--ink-muted`, `--hair`, `--primary`, `--primary-soft`, `--success` (#22C55E), `--success-soft`, `--danger`, `--danger-soft`, `--warning`
   - 다크모드는 보류 (Phase 1.5+)
   - 'Press Start 2P' 폰트 import는 제거 (다마고치도 폐기되므로 더 이상 사용처 없음)
2. **디자인 토큰 위치**: `globals.css`에 CSS 변수로 정의(가장 호환성 높음). Tailwind v4는 `@theme inline` directive를 통해 CSS 변수를 토큰으로 노출하는 구조이므로 정확한 문법은:
   ```css
   :root {
     --color-primary: #2E6FF2;
     --color-ink: #121417;
     /* ... */
   }
   @theme inline {
     --color-primary: var(--color-primary);
     /* Tailwind class로 사용: bg-primary, text-ink */
   }
   ```
   - 색상, 라디우스(card 16px / sheet 24px / btn 14px / chip 6px / input 12px), 그림자(card/soft/fab), 폰트 사이즈 스케일(display/h1/h2/h3/body/body-sm/label/caption)
   - 만약 Tailwind v4 `@theme inline`이 우리 빌드에서 호환 이슈가 있으면 CSS 변수만 사용하고 Tailwind 토큰은 인라인 스타일/유틸리티 클래스로 우회
3. 기존 페이지(메모/가계부/일기/루틴)는 새 토큰을 사용하지 않은 상태이므로 시각적으로 영향 없거나 일부 색만 살짝 바뀜. Phase 1.5에서 페이지별 재작성 시 토큰 본격 활용

### Task 1-2. 다마고치/sprites 코드 폐기

**조치**:
1. 라우트 그룹 `src/app/(tamagotchi)/` 디렉토리 전체 삭제
2. `src/app/(main)/sprites/` 디렉토리 전체 삭제
3. `src/hooks/useTamagotchi.ts` 삭제
4. `src/components/RoutineParty.tsx` 삭제
5. `public/tamagotchi/` 디렉토리 삭제
6. `public/sprites/` 디렉토리 삭제
7. 다른 파일에서 위 import가 있다면 모두 제거 (특히 `(main)/home/page.tsx`가 RoutineParty를 import하고 있음 → home 재작성 시 자동 해결)
8. `src/lib/constants.ts`에서 다마고치 관련 상수가 있다면 제거 (없을 가능성, 확인 필요)
9. `npm run build`로 빌드 깨지는지 확인

### Task 1-3. 다마고치 DB 테이블 drop

**조치**: `supabase_migration_phase1_drop_tamagotchi.sql` 작성:
```sql
DROP TABLE IF EXISTS tamagotchi_state CASCADE;
```

⚠️ **사용자 컨펌 후 직접 Supabase SQL Editor에서 실행** (Phase 0의 RLS와 동일한 방식). 코드 폐기와 마이그레이션 사이 잠깐 데이터는 남아있어도 RLS로 막혀서 안전.

### Task 1-4. BottomNav 5탭 재구성

**현재**: `src/components/ui/BottomNav.tsx` — 5탭(홈/가계부/일기/메모/루틴), 픽셀 이미지 아이콘.

**조치**:
1. `BottomNav.tsx` 전체 재작성:
   - 5탭 구성: 홈 / 가계부 / 메모 / 일기 / 루틴 (순서 변경 — 가계부가 두 번째)
   - 아이콘: Solid SVG (Lucide 또는 직접 작성), 비활성 회색 `#C5CCD3` / 활성 primary `#2E6FF2`
   - 라벨: 비활성 `#8B95A1` / 활성 `#2E6FF2` + bold
   - 컨테이너: 흰 배경 + 상단 hairline + safe-area-inset-bottom
2. 활성 상태는 `usePathname()`이 해당 prefix로 시작하는지로 판단
3. 아이콘 SVG는 인라인으로 `BottomNav.tsx` 내부에 정의 (별도 파일 분리는 Phase 1.5에서 아이콘 수가 많아지면)

### Task 1-5. 홈 페이지 재작성 (Server Components 패턴)

**현재**: `src/app/(main)/home/page.tsx` — `"use client"` + 클라이언트에서 supabase.from() 호출 다수, RoutineParty 임포트.

**조치**: 전체 재작성. 새 구조:

```
src/app/(main)/home/
  page.tsx              # async server component, 데이터 fetch + 컴포넌트 조합
  HomeKPICard.tsx       # 클라이언트 컴포넌트 (Link로 /budget 진입), 내부 로직 단순
  HomeMemoCard.tsx      # 클라이언트 컴포넌트 (빠른메모 input form, server action 호출)
  HomeRoutineCard.tsx   # 서버 컴포넌트 (정적 표시, 진입 링크만)
  actions.ts            # server actions: createQuickMemo
src/lib/budget/summary.ts  # 서버에서 가계부 요약 계산
src/lib/routine/today.ts   # 서버에서 오늘 루틴 상태 계산
src/lib/memo/recent.ts     # 서버에서 최근 메모 N개
```

데이터 페치는 모두 `src/lib/supabase/server.ts`의 `createClient()` 사용.

홈 카드 3개:
1. **KPI 카드**: 이번달 지출 / 예산 / 진행률 바 / 오늘·이번 주·일평균 3등분. `<Link href="/budget">` 래핑
2. **메모 카드**: 빠른메모 input(textarea, Enter로 저장 or 버튼) + 최근 메모 2-3 가로 스크롤. 빠른메모는 Server Action `createQuickMemo` 호출
3. **루틴 카드**: 완료/총 + 진행률 바(`#22C55E`) + 남은 항목 chip 최대 4개(나머지는 `+N` 표시)

빠른메모 Server Action:
- 인증 확인 (`requireSession` 헬퍼 활용)
- 입력: content (1~512자), 태그 = `MEMO_TAGS[0]` (기본값, 사용자가 메모 페이지에서 변경 가능)
- `memo_entries`에 insert
- `revalidatePath("/home")` + `revalidatePath("/memo")`

### Task 1-6. 메모 페이지 탭 분기 추가

**현재**: `src/app/(main)/memo/page.tsx` — 메모 목록만 표시 (388줄 단일 파일).

**조치**:
1. 페이지 상단에 [메모 | 큐레이션] 두 개 탭 헤더 추가 (지점앱과 동일한 chip 스타일, 활성 탭은 `#121417` 배경 + 흰 글씨, 비활성은 `#F2F4F6` 배경 + 회색 글씨)
2. 탭 상태는 URL search param `?tab=curation`로 관리(서버 측 보존). 기본은 메모 탭
3. 메모 탭은 기존 UI 그대로 (Phase 1.5에서 재작성)
4. 큐레이션 탭은 새 컴포넌트 `MemoCurationPlaceholder.tsx`:
   - 안내 문구 "Phase 2에서 자동 수집 시작 — 인스타에서 단축어로 보낸 링크가 여기 카테고리별로 정리됩니다"
   - 카테고리 chip 8개 비활성 (회색): 음식·카페 / 여행 / 패션 / 운동 / 인테리어 / 영감 / 정보·꿀팁 / 기타
   - 빈 카드 영역 또는 일러스트 한 줄

### Task 1-7. 다마고치 폐기 후 코드 회귀 점검

**조치**:
1. `npm run build` 통과
2. `npm test` 29 tests PASS 유지
3. `grep -r "tamagotchi\|sprites\|Routine.*Party\|Press Start 2P" src/` 결과 0건
4. 빌드 결과의 라우트 목록에서 `/tamagotchi`, `/sprites` 빠짐 확인
5. 기존 Phase 0에서 만든 보안 헬퍼들(`requireSession`, `safeFetch` 등) 영향 없음 확인

### Task 1-8. 디자인 시스템 토큰 사용 가이드 문서 추가

**조치**: `docs/design-tokens.md` 작성. 색상 변수, 폰트 스케일, 라디우스, 그림자, 컴포넌트 패턴(card/sheet/chip/btn)을 표로 정리. Phase 1.5에서 페이지 재작성할 때 참조용.

## 파일 구조 (Phase 1 끝 시점 추정)

```
src/
  app/
    (auth)/login/...                    [그대로]
    (main)/
      home/
        page.tsx                        [재작성, async server]
        HomeKPICard.tsx                 [신규]
        HomeMemoCard.tsx                [신규, "use client"]
        HomeRoutineCard.tsx             [신규]
        actions.ts                      [신규, server actions]
      budget/page.tsx                   [그대로 — Phase 1.5]
      diary/page.tsx                    [그대로 — Phase 1.5]
      memo/
        page.tsx                        [수정: 탭 헤더 추가]
        MemoCurationPlaceholder.tsx     [신규]
      routine/page.tsx                  [그대로 — Phase 1.5]
      sprites/                          [삭제]
      layout.tsx                        [그대로]
    (tamagotchi)/                       [전체 삭제]
    api/                                [그대로]
    globals.css                         [재작성]
    favicon.ico                         [그대로]
  components/
    ui/
      BottomNav.tsx                     [재작성]
    RoutineParty.tsx                    [삭제]
  hooks/
    useTamagotchi.ts                    [삭제]
  lib/
    auth/                               [Phase 0 그대로]
    og/                                 [Phase 0 그대로]
    supabase/                           [그대로]
    budget/summary.ts                   [신규, 서버 헬퍼]
    routine/today.ts                    [신규]
    memo/recent.ts                      [신규]
    constants.ts                        [그대로 또는 minor]
    memoColors.ts                       [그대로]

public/
  tamagotchi/                           [삭제]
  sprites/                              [삭제]
  icons/                                [신규 또는 그대로]

supabase_migration_phase1_drop_tamagotchi.sql  [신규]
docs/design-tokens.md                          [신규]
docs/superpowers/specs/.../...
```

## 검증

- [ ] `npm run build` 성공, 라우트 목록에 `/tamagotchi /sprites` 없음
- [ ] `npm test` 29 tests PASS 유지
- [ ] `grep -r "tamagotchi\|Press Start 2P" src/` 0건
- [ ] Vercel Preview에서 `/home` 새 디자인 정상 노출
- [ ] `/home`의 빠른메모 input → 저장 → `/memo`에서 즉시 보임
- [ ] BottomNav 5탭 (홈/가계부/메모/일기/루틴) 모두 진입, 활성 상태 색 변경
- [ ] `/memo?tab=curation` 진입 시 placeholder 노출
- [ ] `/budget /diary /routine` 기존 페이지 작동 유지 (디자인은 옛날이지만 깨지지 않음)
- [ ] Supabase Advisor Critical 0건 유지
- [ ] `tamagotchi_state` 테이블 drop 후에도 어떤 페이지도 깨지지 않음

## 위험 / 트레이드오프

- **디자인 시스템 교체 후 일시적 어색함**: Phase 1 끝나면 홈만 새 디자인이고 나머지 페이지는 옛 디자인. Phase 1.5 진행 전까지 "혼합 상태". 사용자 합의됨.
- **Tailwind v4의 `@theme` directive**: 비교적 새로운 문법. 만약 호환성 이슈 있으면 globals.css의 CSS 변수만 사용하는 폴백으로 전환.
- **Server Action으로 빠른메모 저장**: Next.js 16의 Server Action 문법이 우리 환경(`next dev --webpack`)에서 정상 작동 확인 필요. 만약 문제 있으면 `/api/memo/quick` POST 엔드포인트로 폴백.
- **다마고치 DB drop은 사용자 직접 실행**: 자동화하지 않음. 사용자가 SQL Editor에서 실행. (Phase 0의 RLS 적용 패턴과 동일)

## Out of Scope (재확인)

- 메모/가계부/일기/루틴 페이지 디자인 리노베이션 (Phase 1.5)
- 클라이언트 supabase 호출 → Server Components 마이그레이션 (메모/가계부/일기/루틴) — Phase 1.5
- 가계부 카테고리 13개 색상 토큰 — Phase 1.5
- 큐레이션 자동화 백엔드 / cron / 동기 처리 — Phase 2
- SMS 자동 가계부 입력 — Phase 3
