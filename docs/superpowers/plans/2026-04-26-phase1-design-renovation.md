# Phase 1 — 디자인 리노베이션 + 다마고치 폐기 + 홈 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 글로벌 디자인 시스템을 토스/지점앱 스타일로 교체하고, 다마고치 코드/DB를 모두 폐기한 뒤, 홈 페이지를 Server Components 기반의 새 레이아웃(KPI + 빠른메모 + 루틴)으로 재작성한다. BottomNav를 5탭(홈/가계부/메모/일기/루틴)으로 재구성하고, 메모 페이지에 [메모|큐레이션] 탭 분기를 추가한다.

**Architecture:** `globals.css`에 Tailwind v4 `@theme` directive로 디자인 토큰을 등록해 전체 코드베이스가 동일 토큰을 사용한다. 홈 페이지는 `async` Server Component가 `src/lib/{budget,routine,memo}/`의 헬퍼로 데이터를 fetch하고, 빠른메모는 Server Action으로 저장한다. 다마고치 관련 코드/DB는 일괄 삭제(별도 Task로 분리해 회귀 점검 후 다음 단계 진행). Phase 1.5에서 페이지별 본격 리노베이션을 위한 모범 사례를 홈 페이지가 제공한다.

**Tech Stack:** Next.js 16 (Server Components, Server Actions), React 19, Tailwind v4 (`@theme`), Pretendard Variable, TypeScript, Vitest, `@supabase/ssr`.

**Working directory:** `/Users/daniel_home/daniel-personal-app`
**Branch:** `phase1-design-renovation`
**Spec:** `docs/superpowers/specs/2026-04-26-phase1-design-renovation-design.md`

---

## File Structure (Phase 1 끝 시점)

### 신규
```
src/app/(main)/home/
  HomeKPICard.tsx                # 이번달 지출 KPI, /budget 진입 링크
  HomeMemoCard.tsx               # 빠른메모 input + 최근 메모 리스트 (Client)
  HomeRoutineCard.tsx            # 오늘 루틴 진행 + 남은 chip
  actions.ts                     # createQuickMemo Server Action
src/app/(main)/memo/
  MemoCurationPlaceholder.tsx    # 큐레이션 탭 placeholder
src/lib/budget/
  summary.ts                     # 서버 측 가계부 요약 헬퍼
  summary.test.ts
src/lib/routine/
  today.ts                       # 서버 측 오늘 루틴 상태 헬퍼
  today.test.ts
src/lib/memo/
  recent.ts                      # 서버 측 최근 메모 헬퍼
  recent.test.ts
src/app/(main)/home/actions.test.ts  # Server Action 단위 테스트
docs/design-tokens.md            # 디자인 토큰 가이드
supabase_migration_phase1_drop_tamagotchi.sql
```

### 수정
```
src/app/globals.css              # 재작성 (Pretendard + 토큰)
src/app/(main)/home/page.tsx     # 재작성 (async Server Component)
src/app/(main)/memo/page.tsx     # 탭 헤더 추가
src/components/ui/BottomNav.tsx  # 5탭 + Solid 아이콘 재작성
src/lib/constants.ts             # (검토 후 변경 없음 가능)
```

### 삭제
```
src/app/(tamagotchi)/                 # 디렉토리 전체
src/app/(main)/sprites/               # 디렉토리 전체
src/components/RoutineParty.tsx
src/hooks/useTamagotchi.ts
public/tamagotchi/                    # 디렉토리 전체
public/sprites/                       # 디렉토리 전체
```

---

## Task 1: 다마고치/sprites 코드 폐기

**Files:**
- Delete: `src/app/(tamagotchi)/`, `src/app/(main)/sprites/`, `src/components/RoutineParty.tsx`, `src/hooks/useTamagotchi.ts`, `public/tamagotchi/`, `public/sprites/`
- Modify (임시): `src/app/(main)/home/page.tsx` (RoutineParty import 제거하기 위해 — Task 5h에서 어차피 재작성하지만 빌드 깨지지 않게 임시 처리)

- [ ] **Step 1: 디렉토리/파일 삭제**

```bash
cd /Users/daniel_home/daniel-personal-app
rm -rf "src/app/(tamagotchi)"
rm -rf "src/app/(main)/sprites"
rm -f src/components/RoutineParty.tsx
rm -f src/hooks/useTamagotchi.ts
rm -rf public/tamagotchi
rm -rf public/sprites
```

- [ ] **Step 2: home/page.tsx에서 RoutineParty import 제거 (임시 패치)**

`src/app/(main)/home/page.tsx`에서 다음 두 줄 제거:
- `import RoutineParty from "@/components/RoutineParty";`
- `<RoutineParty />` 렌더 부분 (대략 line 164 근처)

`<RoutineParty />` 자리에 `<div className="text-center text-gray-400 text-xs py-4">루틴 위젯 — Task 5에서 재작성</div>` 임시 주입.

(이 파일은 Task 5h에서 완전히 재작성됨. 지금은 빌드만 통과시킴.)

- [ ] **Step 3: 빌드 확인 (TypeScript 컴파일)**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key \
SUPABASE_SERVICE_ROLE_KEY=placeholder-service \
ANTHROPIC_API_KEY=placeholder-key \
COLLECT_API_KEY=placeholder \
DEFAULT_USER_ID=00000000-0000-0000-0000-000000000000 \
BUDGET_API_KEY=placeholder \
npm run build 2>&1 | tail -25
```
Expected: 컴파일 성공. `/tamagotchi`, `/sprites` 라우트가 빌드 결과에서 사라짐.

빌드 후 sw.js 등 PWA 산출물이 dirty면 `git checkout -- public/sw.js public/workbox-*.js` 정리.

- [ ] **Step 4: 잔여 참조 점검**

```bash
grep -rn "RoutineParty\|useTamagotchi\|Press Start 2P\|/tamagotchi/sprites\|/sprites/page" src/ 2>&1
```
Expected: home/page.tsx의 `Press Start 2P` 한 줄(`const PX = ...`)만 남음 — Task 5h에서 제거됨.

- [ ] **Step 5: 테스트 회귀 확인**

```bash
npm test
```
Expected: 29 tests PASS (Phase 0 동일).

- [ ] **Step 6: 커밋**

```bash
git add -A
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
chore(phase1): 다마고치/sprites 코드 일괄 폐기

- (tamagotchi)/, (main)/sprites/, RoutineParty.tsx, useTamagotchi.ts 삭제
- public/tamagotchi/, public/sprites/ 삭제
- home/page.tsx의 RoutineParty 임포트 제거 (Task 5h에서 재작성 예정)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: tamagotchi_state DB drop SQL 작성

**Files:**
- Create: `supabase_migration_phase1_drop_tamagotchi.sql`

⚠ 이 SQL은 사용자가 Supabase SQL Editor에서 직접 실행. Phase 1 코드 머지 후 실행. 코드가 더 이상 테이블을 참조하지 않으므로 drop 가능.

- [ ] **Step 1: SQL 파일 작성**

```sql
-- supabase_migration_phase1_drop_tamagotchi.sql
-- 적용 시점: Phase 1 코드가 main에 머지된 후 (Phase 0 RLS 적용과 동일한 패턴)
-- 사전 점검: 코드에서 tamagotchi_state 참조가 모두 제거되었는지 (Task 1 완료 후)
--
-- 적용 방법: Supabase Dashboard → SQL Editor → 이 파일 전체 붙여넣기 → Run

DROP TABLE IF EXISTS tamagotchi_state CASCADE;
```

- [ ] **Step 2: 커밋**

```bash
git add supabase_migration_phase1_drop_tamagotchi.sql
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(db): tamagotchi_state DROP SQL 작성 (Phase 1 머지 후 적용)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: globals.css 재작성 + 디자인 토큰

**Files:**
- Modify: `src/app/globals.css` (전체 교체)

- [ ] **Step 1: globals.css 전체 교체**

`src/app/globals.css` 전체 내용:

```css
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css');
@import "tailwindcss";

/* ═══════════════════════════════════════════════════
   디자인 토큰 — 지점앱 1:1 차용 (success만 #22C55E)
   ═══════════════════════════════════════════════════ */
@theme {
  /* Colors */
  --color-bg: #F4F6F8;
  --color-surface: #FFFFFF;
  --color-ink: #121417;
  --color-ink-sub: #6B7684;
  --color-ink-muted: #8B95A1;
  --color-hair: #E5E8EB;
  --color-hair-light: #F2F4F6;
  --color-primary: #2E6FF2;
  --color-primary-soft: #E8F0FE;
  --color-success: #22C55E;
  --color-success-soft: #DCFCE7;
  --color-danger: #DC2626;
  --color-danger-soft: #FDECEC;
  --color-warning: #F59E0B;

  /* Radii */
  --radius-card: 16px;
  --radius-card-lg: 20px;
  --radius-sheet: 24px;
  --radius-btn: 14px;
  --radius-input: 12px;
  --radius-chip: 6px;

  /* Shadows */
  --shadow-card: 0 1px 2px rgba(17,24,39,0.04), 0 4px 14px rgba(17,24,39,0.04);
  --shadow-soft: 0 1px 2px rgba(17,24,39,0.04), 0 4px 14px rgba(17,24,39,0.03);
  --shadow-fab: 0 4px 12px rgba(46,111,242,0.28);

  /* Font family */
  --font-sans: 'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
}

/* ═══════════════════════════════════════════════════
   Base
   ═══════════════════════════════════════════════════ */
:root {
  --background: var(--color-bg);
  --foreground: var(--color-ink);
}

body {
  background: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-sans);
  font-weight: 500;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overscroll-behavior: none;
}

input, textarea, button {
  font-family: inherit;
}

/* iOS safe area */
.safe-area-pb {
  padding-bottom: env(safe-area-inset-bottom);
}

/* Hide scrollbar */
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Tap highlight remove */
* {
  -webkit-tap-highlight-color: transparent;
}

/* Slide-up animation for sheets/modals */
@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}
```

변경 요약:
- ❌ `Press Start 2P` 임포트 제거
- ❌ 다마고치 관련 keyframes(spriteFloat/wiggle/eat, heartFloat, starBounce, rainbow-glow) 제거
- ❌ ios-input 클래스 제거 (Tailwind 토큰으로 대체)
- ✅ Pretendard Variable 임포트
- ✅ Tailwind v4 `@theme`로 색상/라디우스/그림자/폰트 토큰 등록
- ✅ `bg-bg`, `bg-surface`, `text-ink`, `rounded-card`, `shadow-card` 등 유틸리티 자동 생성
- ✅ slide-up 애니메이션 유지 (메모 시트가 사용 중)

- [ ] **Step 2: 빌드 확인**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key SUPABASE_SERVICE_ROLE_KEY=placeholder-service ANTHROPIC_API_KEY=placeholder-key COLLECT_API_KEY=placeholder DEFAULT_USER_ID=00000000-0000-0000-0000-000000000000 BUDGET_API_KEY=placeholder npm run build 2>&1 | tail -15
```
Expected: 컴파일 성공. (기존 페이지는 새 토큰을 안 써서 이상하게 보일 수 있지만 빌드는 통과해야 함.)

빌드 후 sw.js drift 정리.

- [ ] **Step 3: 시각적 회귀 확인**

`npm run dev` 후 http://localhost:3000/login 진입해 로그인 → /home으로 이동.
Expected: 페이지가 옛 픽셀 폰트 → Pretendard로 바뀜. 깨지는 곳 없음. 배경이 살짝 회색(`#F4F6F8`)으로 변함.

- [ ] **Step 4: 커밋**

```bash
git add src/app/globals.css
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(design): globals.css 재작성 - Pretendard + 지점앱 토큰 (success #22C55E)

- Press Start 2P + 다마고치 keyframes 제거
- Tailwind v4 @theme로 색상/라디우스/그림자/폰트 토큰 등록
- bg-primary, text-ink, rounded-card 등 유틸리티 자동 생성

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: BottomNav 5탭 재작성

**Files:**
- Modify: `src/components/ui/BottomNav.tsx` (전체 교체)

- [ ] **Step 1: BottomNav 전체 교체**

`src/components/ui/BottomNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type IconProps = { active: boolean };

function HomeIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "var(--color-primary)" : "#C5CCD3"}>
      <path d="M3 11l9-8 9 8v10a2 2 0 01-2 2h-3v-7h-8v7H5a2 2 0 01-2-2z" />
    </svg>
  );
}

function WalletIcon({ active }: IconProps) {
  const fill = active ? "var(--color-primary)" : "#C5CCD3";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <rect x="3" y="6" width="18" height="14" rx="3" fill={fill} />
      <path d="M3 9V7a2 2 0 012-2h10l3 3" fill="none" stroke={fill} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17" cy="13" r="1.5" fill="white" />
    </svg>
  );
}

function MemoIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "var(--color-primary)" : "#C5CCD3"}>
      <path d="M5 4h11l3 3v13a1 1 0 01-1 1H5z" />
      <path d="M9 9h6M9 13h6M9 17h4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DiaryIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "var(--color-primary)" : "#C5CCD3"}>
      <path d="M12 21s-7-4.5-7-11a4 4 0 017-2.6A4 4 0 0119 10c0 6.5-7 11-7 11z" />
    </svg>
  );
}

function RoutineIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "var(--color-primary)" : "#C5CCD3"}>
      <circle cx="12" cy="12" r="10" />
      <path d="M7 12l3 3 7-7" stroke="white" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const tabs = [
  { href: "/home", label: "홈", Icon: HomeIcon },
  { href: "/budget", label: "가계부", Icon: WalletIcon },
  { href: "/memo", label: "메모", Icon: MemoIcon },
  { href: "/diary", label: "일기", Icon: DiaryIcon },
  { href: "/routine", label: "루틴", Icon: RoutineIcon },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-surface border-t border-hair-light z-50"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
    >
      <div className="flex items-center justify-around h-16 max-w-md mx-auto px-2">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2"
            >
              <tab.Icon active={active} />
              <span
                className={
                  active
                    ? "text-[10px] font-bold text-primary"
                    : "text-[10px] font-medium text-ink-muted"
                }
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key SUPABASE_SERVICE_ROLE_KEY=placeholder-service ANTHROPIC_API_KEY=placeholder-key COLLECT_API_KEY=placeholder DEFAULT_USER_ID=00000000-0000-0000-0000-000000000000 BUDGET_API_KEY=placeholder npm run build 2>&1 | tail -10
```
Expected: 성공. sw.js drift 정리.

- [ ] **Step 3: 시각 확인**

`npm run dev` → /home → 하단 nav가 5탭(홈/가계부/메모/일기/루틴)으로 보임. 활성 탭은 primary 블루.

- [ ] **Step 4: 커밋**

```bash
git add src/components/ui/BottomNav.tsx
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(nav): BottomNav 5탭 재작성 - Solid 아이콘 + 가계부 nav 진입

홈/가계부/메모/일기/루틴 (큐레이션은 메모 페이지 안 탭으로 이동 예정).
픽셀 이미지 → Solid SVG, 활성 탭은 primary 블루.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5a: `src/lib/budget/summary.ts` (TDD)

**Files:**
- Create: `src/lib/budget/summary.ts`
- Test: `src/lib/budget/summary.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// src/lib/budget/summary.test.ts
import { describe, test, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

import { getBudgetSummary } from "./summary";

function makeChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.neq = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

describe("getBudgetSummary", () => {
  beforeEach(() => {
    fromMock.mockReset();
    vi.useFakeTimers();
    // 2026-04-26 일요일 (로컬 자정으로 고정)
    vi.setSystemTime(new Date(2026, 3, 26, 12, 0, 0));
  });

  test("월/주/오늘 지출이 누적된다", async () => {
    fromMock.mockReturnValueOnce(makeChain([
      { amount: 12000, date: "2026-04-26" },  // 오늘
      { amount: 6500, date: "2026-04-26" },   // 오늘
      { amount: 14000, date: "2026-04-25" },  // 어제 (이번 주)
      { amount: 50000, date: "2026-04-20" },  // 이번 주 시작 전 (월에만 포함)
    ]));

    const result = await getBudgetSummary();
    expect(result.todaySpending).toBe(18500);  // 오늘 2건
    expect(result.weekSpending).toBe(32500);    // 일~토 (4/26 일요일 시작)
    expect(result.monthSpending).toBe(82500);   // 4월 전체
    expect(result.daysIntoMonth).toBe(26);
  });

  test("데이터가 비어도 0으로 반환", async () => {
    fromMock.mockReturnValueOnce(makeChain([]));
    const result = await getBudgetSummary();
    expect(result.todaySpending).toBe(0);
    expect(result.weekSpending).toBe(0);
    expect(result.monthSpending).toBe(0);
  });

  test("monthlyBudget은 상수 2_000_000 반환", async () => {
    fromMock.mockReturnValueOnce(makeChain([]));
    const result = await getBudgetSummary();
    expect(result.monthlyBudget).toBe(2_000_000);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd /Users/daniel_home/daniel-personal-app
npm test -- summary
```
Expected: FAIL (모듈 not found).

- [ ] **Step 3: 구현**

```ts
// src/lib/budget/summary.ts
import { createClient } from "@/lib/supabase/server";

const MONTHLY_BUDGET = 2_000_000;

export type BudgetSummary = {
  monthlyBudget: number;
  monthSpending: number;
  weekSpending: number;
  todaySpending: number;
  daysIntoMonth: number;
};

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStart(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01";
}

function weekStart(d: Date): string {
  const w = new Date(d);
  w.setDate(w.getDate() - w.getDay()); // 일요일 시작
  return localDateStr(w);
}

export async function getBudgetSummary(): Promise<BudgetSummary> {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = localDateStr(today);
  const mStart = monthStart(todayStr);
  const wStart = weekStart(today);

  const { data } = await supabase
    .from("budget_entries")
    .select("amount, date")
    .gte("date", mStart)
    .lte("date", todayStr)
    .neq("category", "고정지출");

  const entries = (data ?? []) as { amount: number; date: string }[];
  const monthSpending = entries.reduce((sum, e) => sum + e.amount, 0);
  const weekSpending = entries
    .filter((e) => e.date >= wStart)
    .reduce((sum, e) => sum + e.amount, 0);
  const todaySpending = entries
    .filter((e) => e.date === todayStr)
    .reduce((sum, e) => sum + e.amount, 0);

  return {
    monthlyBudget: MONTHLY_BUDGET,
    monthSpending,
    weekSpending,
    todaySpending,
    daysIntoMonth: today.getDate(),
  };
}
```

- [ ] **Step 4: 통과 확인**

```bash
npm test -- summary
```
Expected: PASS, 3 tests.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/budget/summary.ts src/lib/budget/summary.test.ts
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(lib/budget): 서버 측 가계부 요약 헬퍼 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5b: `src/lib/routine/today.ts` (TDD)

**Files:**
- Create: `src/lib/routine/today.ts`
- Test: `src/lib/routine/today.test.ts`

- [ ] **Step 1: 실패 테스트**

```ts
// src/lib/routine/today.test.ts
import { describe, test, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

import { getTodayRoutine } from "./today";

function makeItemsChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

function makeChecksChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  // 두 번째 .eq 호출이 마지막
  let eqCalls = 0;
  chain.eq = vi.fn(() => {
    eqCalls++;
    if (eqCalls < 2) return chain;
    return Promise.resolve({ data, error: null });
  });
  return chain;
}

describe("getTodayRoutine", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  test("완료/총/남은 항목 반환", async () => {
    fromMock
      .mockReturnValueOnce(makeItemsChain([
        { id: "i1", name: "운동", emoji: "🏃" },
        { id: "i2", name: "영양제", emoji: "💊" },
        { id: "i3", name: "독서", emoji: "📖" },
      ]))
      .mockReturnValueOnce(makeChecksChain([
        { item_id: "i2", checked: true },
      ]));

    const result = await getTodayRoutine();
    expect(result.total).toBe(3);
    expect(result.completed).toBe(1);
    expect(result.remaining.map((r) => r.id)).toEqual(["i1", "i3"]);
  });

  test("아무 항목 없으면 0/0/[]", async () => {
    fromMock
      .mockReturnValueOnce(makeItemsChain([]))
      .mockReturnValueOnce(makeChecksChain([]));

    const result = await getTodayRoutine();
    expect(result.total).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.remaining).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npm test -- routine/today
```
Expected: FAIL.

- [ ] **Step 3: 구현**

```ts
// src/lib/routine/today.ts
import { createClient } from "@/lib/supabase/server";

export type RoutineItem = { id: string; name: string; emoji: string };

export type TodayRoutine = {
  total: number;
  completed: number;
  remaining: RoutineItem[];
};

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getTodayRoutine(): Promise<TodayRoutine> {
  const supabase = await createClient();
  const todayStr = localDateStr(new Date());

  const [itemsRes, checksRes] = await Promise.all([
    supabase.from("routine_items").select("id, name, emoji").order("sort_order", { ascending: true }),
    supabase
      .from("routine_checks")
      .select("item_id, checked")
      .eq("date", todayStr)
      .eq("checked", true),
  ]);

  const items = ((itemsRes as { data: RoutineItem[] | null }).data ?? []) as RoutineItem[];
  const checks = ((checksRes as { data: { item_id: string }[] | null }).data ?? []);
  const checkedSet = new Set(checks.map((c) => c.item_id));

  return {
    total: items.length,
    completed: items.filter((i) => checkedSet.has(i.id)).length,
    remaining: items.filter((i) => !checkedSet.has(i.id)),
  };
}
```

- [ ] **Step 4: 통과 확인**

```bash
npm test -- routine/today
```
Expected: PASS, 2 tests.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/routine/today.ts src/lib/routine/today.test.ts
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(lib/routine): 오늘 루틴 상태 헬퍼 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5c: `src/lib/memo/recent.ts` (TDD)

**Files:**
- Create: `src/lib/memo/recent.ts`
- Test: `src/lib/memo/recent.test.ts`

- [ ] **Step 1: 실패 테스트**

```ts
// src/lib/memo/recent.test.ts
import { describe, test, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

import { getRecentMemos } from "./recent";

function makeChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve({ data, error: null }));
  return chain;
}

describe("getRecentMemos", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  test("기본 limit=3, 최근 메모 배열 반환", async () => {
    fromMock.mockReturnValueOnce(makeChain([
      { id: "m1", content: "첫 메모", tag: "발견", created_at: "2026-04-26T10:00:00Z" },
      { id: "m2", content: "두번째", tag: "생각중", created_at: "2026-04-26T09:00:00Z" },
    ]));

    const result = await getRecentMemos();
    expect(result.length).toBe(2);
    expect(result[0].content).toBe("첫 메모");
  });

  test("limit 인자 사용 가능", async () => {
    const chain = makeChain([]);
    fromMock.mockReturnValueOnce(chain);
    await getRecentMemos(10);
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  test("data가 null이면 빈 배열", async () => {
    fromMock.mockReturnValueOnce(makeChain(null));
    const result = await getRecentMemos();
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npm test -- memo/recent
```
Expected: FAIL.

- [ ] **Step 3: 구현**

```ts
// src/lib/memo/recent.ts
import { createClient } from "@/lib/supabase/server";

export type RecentMemo = {
  id: string;
  content: string;
  tag: string;
  created_at: string;
};

export async function getRecentMemos(limit: number = 3): Promise<RecentMemo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memo_entries")
    .select("id, content, tag, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as RecentMemo[];
}
```

- [ ] **Step 4: 통과 확인**

```bash
npm test -- memo/recent
```
Expected: PASS, 3 tests.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/memo/recent.ts src/lib/memo/recent.test.ts
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(lib/memo): 최근 메모 헬퍼 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5d: `createQuickMemo` Server Action (TDD)

**Files:**
- Create: `src/app/(main)/home/actions.ts`
- Test: `src/app/(main)/home/actions.test.ts`

- [ ] **Step 1: 실패 테스트**

```ts
// src/app/(main)/home/actions.test.ts
import { describe, test, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
const fromMock = vi.fn(() => ({ insert: insertMock }));
const requireSessionMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));
vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: requireSessionMock,
}));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { createQuickMemo } from "./actions";

describe("createQuickMemo", () => {
  beforeEach(() => {
    insertMock.mockReset();
    fromMock.mockClear();
    requireSessionMock.mockReset();
    revalidatePathMock.mockReset();
  });

  test("미인증이면 ok=false, error=Unauthorized", async () => {
    requireSessionMock.mockResolvedValue({ ok: false, response: new Response() });
    const result = await createQuickMemo("hello");
    expect(result).toEqual({ ok: false, error: "Unauthorized" });
    expect(insertMock).not.toHaveBeenCalled();
  });

  test("빈 content는 ok=false", async () => {
    requireSessionMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
    const result = await createQuickMemo("   ");
    expect(result).toEqual({ ok: false, error: "Invalid content" });
    expect(insertMock).not.toHaveBeenCalled();
  });

  test("512자 초과는 ok=false", async () => {
    requireSessionMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
    const long = "x".repeat(513);
    const result = await createQuickMemo(long);
    expect(result.ok).toBe(false);
  });

  test("정상 입력은 insert + revalidate + ok=true", async () => {
    requireSessionMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
    insertMock.mockResolvedValue({ error: null });
    const result = await createQuickMemo("새 메모");
    expect(result).toEqual({ ok: true });
    expect(insertMock).toHaveBeenCalledWith({ content: "새 메모", tag: "발견" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/home");
    expect(revalidatePathMock).toHaveBeenCalledWith("/memo");
  });

  test("DB 오류는 ok=false", async () => {
    requireSessionMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
    insertMock.mockResolvedValue({ error: new Error("db") });
    const result = await createQuickMemo("메모");
    expect(result).toEqual({ ok: false, error: "Save failed" });
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npm test -- home/actions
```
Expected: FAIL.

- [ ] **Step 3: 구현**

```ts
// src/app/(main)/home/actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { revalidatePath } from "next/cache";
import { MEMO_TAGS } from "@/lib/constants";

const MAX_CONTENT = 512;

export type QuickMemoResult = { ok: true } | { ok: false; error: string };

export async function createQuickMemo(content: string): Promise<QuickMemoResult> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, error: "Unauthorized" };

  const trimmed = content.trim();
  if (!trimmed || trimmed.length > MAX_CONTENT) {
    return { ok: false, error: "Invalid content" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("memo_entries")
    .insert({ content: trimmed, tag: MEMO_TAGS[0] });

  if (error) return { ok: false, error: "Save failed" };

  revalidatePath("/home");
  revalidatePath("/memo");
  return { ok: true };
}
```

- [ ] **Step 4: 통과 확인**

```bash
npm test -- home/actions
```
Expected: PASS, 5 tests.

- [ ] **Step 5: 커밋**

```bash
git add src/app/\(main\)/home/actions.ts src/app/\(main\)/home/actions.test.ts
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(home): createQuickMemo Server Action 추가

세션 검증 + 입력 검증 (1~512자) + memo_entries insert + revalidate.
기본 태그는 MEMO_TAGS[0] = "발견" (사용자가 메모 페이지에서 변경 가능).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5e: HomeKPICard 컴포넌트

**Files:**
- Create: `src/app/(main)/home/HomeKPICard.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// src/app/(main)/home/HomeKPICard.tsx
import Link from "next/link";
import type { BudgetSummary } from "@/lib/budget/summary";

function getSpendingComment(amount: number, budget: number): string {
  if (amount === 0) return "무지출 챌린지!";
  const pct = amount / budget;
  if (pct <= 0.3) return "이번달도 아껴쓰자!";
  if (pct <= 0.6) return "슬슬 조심해야겠는걸";
  if (pct <= 0.85) return "좀만 더 아끼자...!";
  if (pct <= 1.0) return "미쳤냐?";
  return "거지가 되고싶냐?";
}

export function HomeKPICard({
  monthlyBudget,
  monthSpending,
  weekSpending,
  todaySpending,
  daysIntoMonth,
}: BudgetSummary) {
  const pct = Math.min(monthSpending / monthlyBudget, 1);
  const dailyAvg = daysIntoMonth > 0 ? Math.round(monthSpending / daysIntoMonth) : 0;
  const comment = getSpendingComment(monthSpending, monthlyBudget);

  return (
    <Link
      href="/budget"
      className="block bg-surface rounded-card p-4 mb-3 border border-hair shadow-card active:opacity-80"
    >
      <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-1.5">
        이번달 지출
      </div>
      <div className="text-[28px] font-extrabold tracking-tight leading-tight">
        {monthSpending.toLocaleString()}원
      </div>
      <div className="text-[12px] text-ink-muted">
        / 예산 {monthlyBudget.toLocaleString()}원
      </div>
      <div className="h-2 bg-hair-light rounded-full mt-3 mb-1.5 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <div className="text-[12px] text-ink-sub">
        {comment} · {Math.round(pct * 100)}%
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3.5 pt-3.5 border-t border-hair-light">
        <div className="text-center">
          <div className="text-[10px] text-ink-muted mb-1">오늘</div>
          <div className="text-[14px] font-bold">{todaySpending.toLocaleString()}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-ink-muted mb-1">이번 주</div>
          <div className="text-[14px] font-bold">{weekSpending.toLocaleString()}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-ink-muted mb-1">일평균</div>
          <div className="text-[14px] font-bold">{dailyAvg.toLocaleString()}</div>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: 빌드 확인 (TypeScript)**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key SUPABASE_SERVICE_ROLE_KEY=placeholder-service ANTHROPIC_API_KEY=placeholder-key COLLECT_API_KEY=placeholder DEFAULT_USER_ID=00000000-0000-0000-0000-000000000000 BUDGET_API_KEY=placeholder npm run build 2>&1 | tail -10
```
Expected: 성공. (홈 page.tsx는 아직 import 안 함 — Task 5h에서 합쳐짐.)

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(main)/home/HomeKPICard.tsx"
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(home): HomeKPICard 컴포넌트 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5f: HomeMemoCard 컴포넌트 (Client + Server Action)

**Files:**
- Create: `src/app/(main)/home/HomeMemoCard.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// src/app/(main)/home/HomeMemoCard.tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createQuickMemo } from "./actions";
import type { RecentMemo } from "@/lib/memo/recent";
import { TAG_COLORS } from "@/lib/memoColors";

type Props = { memos: RecentMemo[] };

export function HomeMemoCard({ memos }: Props) {
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const text = content.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const result = await createQuickMemo(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setContent("");
    });
  }

  return (
    <div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-[14px] font-bold">메모</h2>
        <Link href="/memo" className="text-[11px] text-ink-sub">
          더보기 →
        </Link>
      </div>

      {/* 빠른메모 input */}
      <div className="flex gap-2 mb-3">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSave();
            }
          }}
          placeholder="지금 떠오른 것을…"
          maxLength={512}
          className="flex-1 bg-hair-light rounded-input px-3 py-2.5 text-[13px] outline-none placeholder:text-ink-muted disabled:opacity-50"
          disabled={pending}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!content.trim() || pending}
          className="bg-ink text-white rounded-input px-4 py-2.5 text-[12px] font-bold disabled:opacity-25 active:opacity-70"
        >
          {pending ? "..." : "저장"}
        </button>
      </div>

      {error && <p className="text-[11px] text-danger mb-2">{error}</p>}

      {/* 최근 메모 가로 스크롤 */}
      {memos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {memos.map((memo) => (
            <div
              key={memo.id}
              className={`${TAG_COLORS[memo.tag] ?? "bg-hair-light"} flex-shrink-0 w-[160px] rounded-input p-2.5`}
            >
              <div className="text-[9px] font-bold opacity-60">{memo.tag}</div>
              <p className="text-[12px] mt-1 line-clamp-3 leading-relaxed">{memo.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key SUPABASE_SERVICE_ROLE_KEY=placeholder-service ANTHROPIC_API_KEY=placeholder-key COLLECT_API_KEY=placeholder DEFAULT_USER_ID=00000000-0000-0000-0000-000000000000 BUDGET_API_KEY=placeholder npm run build 2>&1 | tail -10
```
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(main)/home/HomeMemoCard.tsx"
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(home): HomeMemoCard - 빠른메모 input + 최근 메모 가로 스크롤

Server Action createQuickMemo 호출, useTransition으로 pending 상태 표시.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5g: HomeRoutineCard 컴포넌트

**Files:**
- Create: `src/app/(main)/home/HomeRoutineCard.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// src/app/(main)/home/HomeRoutineCard.tsx
import Link from "next/link";
import type { TodayRoutine } from "@/lib/routine/today";

const MAX_CHIPS = 3;

export function HomeRoutineCard({ total, completed, remaining }: TodayRoutine) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const visible = remaining.slice(0, MAX_CHIPS);
  const overflow = remaining.length - visible.length;

  return (
    <Link
      href="/routine"
      className="block bg-surface rounded-card p-4 mb-3 border border-hair shadow-card active:opacity-80"
    >
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-[14px] font-bold">오늘 루틴</h2>
        <span className="text-[11px] text-ink-sub">더보기 →</span>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-[18px] font-extrabold">
          <span className="text-success">{completed}</span>
          <span className="text-ink-sub"> / {total} 완료</span>
        </div>
        <div className="text-[12px] font-bold text-ink-sub">{pct}%</div>
      </div>

      <div className="h-2 bg-hair-light rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-success rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {remaining.length > 0 ? (
        <>
          <div className="text-[11px] text-ink-sub mb-1.5">남은 항목</div>
          <div className="flex gap-1.5 flex-wrap">
            {visible.map((r) => (
              <span
                key={r.id}
                className="text-[11px] px-2.5 py-1 bg-hair-light text-ink-sub rounded-input font-semibold"
              >
                {r.emoji} {r.name}
              </span>
            ))}
            {overflow > 0 && (
              <span className="text-[11px] px-2.5 py-1 bg-surface border border-dashed border-hair text-ink-muted rounded-input">
                +{overflow}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="text-[11px] text-success font-semibold">오늘 루틴 모두 완료 ✨</div>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key SUPABASE_SERVICE_ROLE_KEY=placeholder-service ANTHROPIC_API_KEY=placeholder-key COLLECT_API_KEY=placeholder DEFAULT_USER_ID=00000000-0000-0000-0000-000000000000 BUDGET_API_KEY=placeholder npm run build 2>&1 | tail -5
```
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(main)/home/HomeRoutineCard.tsx"
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(home): HomeRoutineCard - 진행률 + 남은 항목 chip

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5h: home page.tsx 재작성 (async Server Component)

**Files:**
- Modify: `src/app/(main)/home/page.tsx` (전체 교체)

- [ ] **Step 1: 페이지 전체 교체**

`src/app/(main)/home/page.tsx`:

```tsx
// src/app/(main)/home/page.tsx
import { getBudgetSummary } from "@/lib/budget/summary";
import { getTodayRoutine } from "@/lib/routine/today";
import { getRecentMemos } from "@/lib/memo/recent";
import { HomeKPICard } from "./HomeKPICard";
import { HomeMemoCard } from "./HomeMemoCard";
import { HomeRoutineCard } from "./HomeRoutineCard";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day} ${WEEKDAYS[d.getDay()]}요일`;
}

function getGreeting(d: Date): string {
  const h = d.getHours();
  if (h < 6) return "새벽이네요 🌙";
  if (h < 12) return "좋은 아침이에요 ☀️";
  if (h < 18) return "좋은 오후 🌤";
  return "오늘 하루 어땠어요 🌙";
}

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [budget, routine, memos] = await Promise.all([
    getBudgetSummary(),
    getTodayRoutine(),
    getRecentMemos(3),
  ]);

  const today = new Date();

  return (
    <div className="px-4 pt-5 pb-32 max-w-md mx-auto">
      <header className="px-2 pb-3">
        <div className="text-[12px] text-ink-sub mb-0.5">{formatDate(today)}</div>
        <h1 className="text-[18px] font-extrabold tracking-tight">{getGreeting(today)}</h1>
      </header>

      <HomeKPICard {...budget} />
      <HomeMemoCard memos={memos} />
      <HomeRoutineCard {...routine} />
    </div>
  );
}
```

`export const dynamic = "force-dynamic"`는 매 요청마다 데이터를 새로 fetch하기 위함 (지출/메모/루틴 모두 자주 바뀜).

- [ ] **Step 2: 빌드 확인**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key SUPABASE_SERVICE_ROLE_KEY=placeholder-service ANTHROPIC_API_KEY=placeholder-key COLLECT_API_KEY=placeholder DEFAULT_USER_ID=00000000-0000-0000-0000-000000000000 BUDGET_API_KEY=placeholder npm run build 2>&1 | tail -10
```
Expected: 성공. `/home` 라우트가 dynamic(`ƒ`)으로 빌드됨.

- [ ] **Step 3: 시각 확인 (로컬)**

`npm run dev` → 로그인 → /home → 새 디자인 확인. 빠른메모 입력 + 저장 정상 작동, 메모 페이지에서 저장된 메모 보임.

- [ ] **Step 4: 회귀 테스트**

```bash
npm test
```
Expected: 29 + 새로 추가된 테스트(3 + 2 + 3 + 5 = 13) = 42 tests PASS.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(main)/home/page.tsx"
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(home): 페이지 재작성 - async Server Component + 3 카드 레이아웃

Press Start 2P 픽셀 폰트 / 클라이언트 supabase 호출 / RoutineParty 모두 제거.
KPI(이번달 지출) + 메모(빠른메모+최근) + 루틴(진행률+남은 chip) 구조.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 메모 페이지 [메모|큐레이션] 탭 분기

**Files:**
- Modify: `src/app/(main)/memo/page.tsx` (탭 헤더 추가, 큐레이션 탭 placeholder)
- Create: `src/app/(main)/memo/MemoCurationPlaceholder.tsx`

기존 메모 UI는 그대로 두고, 페이지 최상단에 탭 헤더만 추가. 활성 탭이 `curation`이면 placeholder 컴포넌트, 그 외엔 기존 UI.

- [ ] **Step 1: Placeholder 컴포넌트 작성**

```tsx
// src/app/(main)/memo/MemoCurationPlaceholder.tsx
const CATEGORIES = [
  "음식·카페",
  "여행",
  "패션",
  "운동",
  "인테리어",
  "영감",
  "정보·꿀팁",
  "기타",
] as const;

export function MemoCurationPlaceholder() {
  return (
    <div className="px-4 py-12 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-primary-soft flex items-center justify-center text-3xl mb-4">
        📥
      </div>
      <h2 className="text-[16px] font-bold mb-2">큐레이션</h2>
      <p className="text-[13px] text-ink-sub leading-relaxed mb-6 max-w-xs">
        Phase 2에서 자동 수집 시작 — 인스타에서 단축어로 보낸 링크가 여기 카테고리별로 정리됩니다.
      </p>
      <div className="flex gap-1.5 flex-wrap justify-center max-w-xs">
        {CATEGORIES.map((c) => (
          <span
            key={c}
            className="text-[11px] px-2.5 py-1 bg-hair-light text-ink-muted rounded-chip font-semibold"
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 메모 페이지에 탭 헤더 추가**

`src/app/(main)/memo/page.tsx`의 변경:
1. `import { MemoCurationPlaceholder } from "./MemoCurationPlaceholder";` 추가 (파일 상단)
2. `import { useSearchParams, useRouter } from "next/navigation";` 추가
3. 컴포넌트 내부에 탭 상태 추가:
   ```tsx
   const searchParams = useSearchParams();
   const router = useRouter();
   const activeTab = searchParams.get("tab") === "curation" ? "curation" : "memo";
   ```
4. `return` 첫 줄(`<div className="flex flex-col h-full">`) 바로 안에 탭 헤더 삽입:
   ```tsx
   <div className="flex gap-1.5 px-4 pt-4 pb-2 sticky top-0 bg-white z-20">
     <button
       onClick={() => router.replace("/memo")}
       className={
         activeTab === "memo"
           ? "px-3 py-1.5 rounded-input bg-ink text-white text-[12px] font-bold"
           : "px-3 py-1.5 rounded-input bg-hair-light text-ink-sub text-[12px] font-semibold"
       }
     >
       메모
     </button>
     <button
       onClick={() => router.replace("/memo?tab=curation")}
       className={
         activeTab === "curation"
           ? "px-3 py-1.5 rounded-input bg-ink text-white text-[12px] font-bold"
           : "px-3 py-1.5 rounded-input bg-hair-light text-ink-sub text-[12px] font-semibold"
       }
     >
       큐레이션
     </button>
   </div>
   ```
5. 그 다음 줄에 분기:
   ```tsx
   {activeTab === "curation" ? (
     <MemoCurationPlaceholder />
   ) : (
     <>
       {/* 기존 메모 UI 전체 — 헤더, 입력창, 검색, 그리드, 채집함 오버레이 모두 여기에 그대로 둠 */}
     </>
   )}
   ```

⚠ 기존 `<div className="px-4 pt-5 pb-2 sticky top-0 bg-white z-10">` 헤더는 새 탭 헤더와 충돌하므로 `top-[60px]` 정도로 내리거나 sticky 제거. 기존 헤더의 sticky 클래스를 `relative`로 변경하는 것이 가장 단순:
   - `<div className="px-4 pt-5 pb-2 sticky top-0 bg-white z-10">` → `<div className="px-4 pt-5 pb-2 bg-white z-10">`

- [ ] **Step 3: 빌드 확인**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key SUPABASE_SERVICE_ROLE_KEY=placeholder-service ANTHROPIC_API_KEY=placeholder-key COLLECT_API_KEY=placeholder DEFAULT_USER_ID=00000000-0000-0000-0000-000000000000 BUDGET_API_KEY=placeholder npm run build 2>&1 | tail -10
```
Expected: 성공.

- [ ] **Step 4: 시각 확인**

`npm run dev` → /memo (메모 탭 활성, 기존 UI) → /memo?tab=curation (큐레이션 placeholder) → 탭 클릭 시 URL 변경 + 화면 전환.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(main)/memo/page.tsx" "src/app/(main)/memo/MemoCurationPlaceholder.tsx"
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(memo): [메모|큐레이션] 탭 분기 추가 + 큐레이션 placeholder

Phase 1.5에서 메모 탭 자체는 토스 스타일로 본격 리노베이션 예정.
큐레이션 탭은 Phase 2에서 자동 수집 기능 연결 예정.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: design-tokens.md 가이드

**Files:**
- Create: `docs/design-tokens.md`

- [ ] **Step 1: 가이드 문서 작성**

```markdown
# 디자인 토큰 가이드 (Phase 1)

`src/app/globals.css`의 `@theme` directive로 정의됨. Tailwind 유틸리티 클래스로 사용.

## 색상

| 토큰 | 값 | 클래스 예시 | 용도 |
|------|-----|-------------|------|
| `--color-bg` | `#F4F6F8` | `bg-bg` | 페이지 배경 |
| `--color-surface` | `#FFFFFF` | `bg-surface` | 카드/시트 표면 |
| `--color-ink` | `#121417` | `text-ink` | 본문 텍스트 |
| `--color-ink-sub` | `#6B7684` | `text-ink-sub` | 보조 텍스트 |
| `--color-ink-muted` | `#8B95A1` | `text-ink-muted` | 약한 텍스트(라벨, 메타) |
| `--color-hair` | `#E5E8EB` | `border-hair` | 카드 외곽선 |
| `--color-hair-light` | `#F2F4F6` | `border-hair-light`, `bg-hair-light` | 안쪽 구분선/조용한 배경 |
| `--color-primary` | `#2E6FF2` | `bg-primary`, `text-primary` | 주요 액션, 활성 상태 |
| `--color-primary-soft` | `#E8F0FE` | `bg-primary-soft` | 활성 상태 배경 |
| `--color-success` | `#22C55E` | `bg-success`, `text-success` | 완료/성공 (홈 루틴) |
| `--color-success-soft` | `#DCFCE7` | `bg-success-soft` | 완료 배경 |
| `--color-danger` | `#DC2626` | `text-danger` | 오류/경고 |
| `--color-danger-soft` | `#FDECEC` | `bg-danger-soft` | 오류 배경 |
| `--color-warning` | `#F59E0B` | `text-warning` | 주의 |

## 라디우스

| 토큰 | 값 | 클래스 | 용도 |
|------|-----|--------|------|
| `--radius-card` | `16px` | `rounded-card` | 일반 카드 |
| `--radius-card-lg` | `20px` | `rounded-card-lg` | 큰 카드(KPI) |
| `--radius-sheet` | `24px` | `rounded-sheet` | 바텀시트 |
| `--radius-btn` | `14px` | `rounded-btn` | 둥근 버튼 |
| `--radius-input` | `12px` | `rounded-input` | 입력 필드 |
| `--radius-chip` | `6px` | `rounded-chip` | chip/태그 |

## 그림자

| 토큰 | 클래스 | 용도 |
|------|--------|------|
| `--shadow-card` | `shadow-card` | 카드 들기 |
| `--shadow-soft` | `shadow-soft` | 약한 들기 |
| `--shadow-fab` | `shadow-fab` | FAB 버튼 |

## 폰트

`Pretendard Variable`이 기본. weight: 300/500/700/800.

폰트 사이즈는 Tailwind 기본 사이즈(`text-xs/sm/base/lg/xl/2xl/3xl/...`)와 임의 사이즈(`text-[14px]`) 혼용. 자주 쓰는 패턴:
- 카드 제목: `text-[14px] font-bold`
- KPI 숫자: `text-[28px] font-extrabold tracking-tight`
- 라벨: `text-[10px] font-extrabold tracking-wider text-ink-sub uppercase`
- 본문: `text-[13px]` 또는 `text-[12px]`
- 메타: `text-[11px] text-ink-sub`

## 컴포넌트 패턴

### 카드
```tsx
<div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
  ...
</div>
```

### 카드 (탭 가능, 링크)
```tsx
<Link href="/x" className="block bg-surface rounded-card p-4 mb-3 border border-hair shadow-card active:opacity-80">
  ...
</Link>
```

### 라벨
```tsx
<div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">
  이번달 지출
</div>
```

### 진행률 바
```tsx
<div className="h-2 bg-hair-light rounded-full overflow-hidden">
  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
</div>
```

### Chip (선택 가능)
```tsx
<span className="text-[11px] px-2.5 py-1 bg-hair-light text-ink-sub rounded-input font-semibold">
  ...
</span>
```

## Phase 1.5 적용 가이드

메모/가계부/일기/루틴 페이지를 리노베이션할 때:
1. 모든 텍스트 색은 `text-ink/text-ink-sub/text-ink-muted` 중 하나만 사용
2. 카드는 위 패턴 따름 (`bg-surface rounded-card p-4 border border-hair shadow-card`)
3. 액션 버튼은 `bg-ink text-white` 또는 `bg-primary text-white`
4. 가계부 카테고리 색상은 Phase 1.5 진입 시 별도로 정의 (이 가이드 갱신)
```

- [ ] **Step 2: 커밋**

```bash
git add docs/design-tokens.md
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
docs(design): 디자인 토큰 가이드 추가 (Phase 1.5+ 페이지 리노베이션 참고용)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 회귀 점검 + Phase 1 완료 보고

**Files:**
- Create: `docs/superpowers/specs/2026-04-26-phase1-completion.md`

- [ ] **Step 1: 전체 회귀 명령 실행**

```bash
cd /Users/daniel_home/daniel-personal-app
npm test 2>&1 | tail -10
```
Expected: 5 + 4 = 9 file groups, 42 tests PASS (Phase 0 29 + Task 5a 3 + 5b 2 + 5c 3 + 5d 5 = 42).

```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key SUPABASE_SERVICE_ROLE_KEY=placeholder-service ANTHROPIC_API_KEY=placeholder-key COLLECT_API_KEY=placeholder DEFAULT_USER_ID=00000000-0000-0000-0000-000000000000 BUDGET_API_KEY=placeholder npm run build 2>&1 | tail -20
```
Expected:
- 컴파일 성공
- 라우트 목록에 `/tamagotchi`, `/sprites` 없음
- `/home` 라우트가 dynamic(`ƒ`)
- `/memo /budget /diary /routine /login` 라우트 정상

빌드 후 sw.js drift 정리:
```bash
git checkout -- public/sw.js 2>/dev/null
ls public/workbox-*.js 2>&1
git checkout -- public/workbox-*.js 2>/dev/null
git status --short
```
Expected: clean.

- [ ] **Step 2: 잔여 참조 점검**

```bash
grep -rn "tamagotchi\|sprites\|RoutineParty\|useTamagotchi\|Press Start 2P" src/ public/ docs/ 2>&1 | grep -v "phase0\|phase1-completion\|.md:" | head -20
```
Expected: 결과 없음 또는 docs(이전 spec/plan 안의 언급)만.

- [ ] **Step 3: ESLint 통과 확인**

```bash
npm run lint 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 4: 완료 보고서 작성**

`docs/superpowers/specs/2026-04-26-phase1-completion.md`:

```markdown
# Phase 1 완료 보고 (2026-04-26)

**브랜치**: `phase1-design-renovation`
**최종 검증**: `npm test` 42/42 PASS, `npm run build` 성공, 라우트에서 /tamagotchi, /sprites 사라짐

## 적용된 변경

### 코드 — 신규
- `src/lib/budget/summary.ts` (3 tests)
- `src/lib/routine/today.ts` (2 tests)
- `src/lib/memo/recent.ts` (3 tests)
- `src/app/(main)/home/actions.ts` — createQuickMemo Server Action (5 tests)
- `src/app/(main)/home/HomeKPICard.tsx`
- `src/app/(main)/home/HomeMemoCard.tsx`
- `src/app/(main)/home/HomeRoutineCard.tsx`
- `src/app/(main)/memo/MemoCurationPlaceholder.tsx`

### 코드 — 재작성
- `src/app/globals.css` (Pretendard + 지점앱 토큰 + success #22C55E)
- `src/app/(main)/home/page.tsx` (async Server Component)
- `src/components/ui/BottomNav.tsx` (5탭 + Solid 아이콘)
- `src/app/(main)/memo/page.tsx` (탭 헤더 추가)

### 코드 — 삭제
- `src/app/(tamagotchi)/`
- `src/app/(main)/sprites/`
- `src/components/RoutineParty.tsx`
- `src/hooks/useTamagotchi.ts`
- `public/tamagotchi/`
- `public/sprites/`

### 데이터베이스
- `supabase_migration_phase1_drop_tamagotchi.sql` 작성 — 사용자가 SQL Editor에서 실행 (Phase 0 RLS와 동일 패턴)

### 문서
- `docs/design-tokens.md` — Phase 1.5+ 페이지 리노베이션 참고용

## 검증 결과

| 항목 | 상태 |
|------|------|
| `npm test` | ✅ 42/42 tests PASS |
| `npm run build` | ✅ 성공, /tamagotchi /sprites 라우트 사라짐 |
| `npm run lint` | ✅ clean |
| 잔여 다마고치 참조 | ✅ 0건 (docs 제외) |

## Phase 1.5 진입 전 체크리스트

- [ ] Phase 1 PR 머지 → main 배포
- [ ] `supabase_migration_phase1_drop_tamagotchi.sql` SQL Editor에서 실행
- [ ] 프로덕션 사이트에서 /home 새 디자인 확인 + 빠른메모 동작 확인
- [ ] BottomNav 5탭 모두 진입 정상
- [ ] /memo 메모 탭 / 큐레이션 탭 둘 다 정상

## 알려진 미해결 (Phase 1.5+로 이연)

| 항목 | Phase |
|------|-------|
| 메모 페이지 메모 탭 디자인 리노베이션 | 1.5 |
| 가계부 페이지 디자인 리노베이션 + 카테고리 13개 색상 | 1.5 |
| 일기 페이지 디자인 리노베이션 | 1.5 |
| 루틴 페이지 디자인 리노베이션 + 해빗 트래커 + 그래프 | 1.5 |
| 클라이언트 supabase 호출 → Server Components 마이그레이션 (4개 페이지) | 1.5 |
| 큐레이션 자동 수집 + cron + Haiku 4.5 + 프롬프트 캐싱 | 2 |
| SMS 가계부 자동입력 (맥미니 chat.db) | 3 |

## Code Quality Follow-ups (선택)

- `src/lib/routine/today.ts` 테스트의 chain mocking이 약간 복잡 — Phase 1.5에서 `createMockSupabaseClient` 헬퍼로 추출 검토
- `public/sw.js`, `public/workbox-*.js` 빌드 산출물을 `.gitignore`에 추가 (매 빌드마다 dirty 발생) — Phase 1.5 진입 시 처리
- 홈 페이지 `getGreeting()` 시간대 이모지를 사용자가 커스터마이즈할 수 있게 하면 좋을 듯 — Phase 2+에서 검토
```

- [ ] **Step 5: 커밋**

```bash
git add docs/superpowers/specs/2026-04-26-phase1-completion.md
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
docs(phase1): 완료 보고 + Phase 1.5 인계 체크리스트

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 검증 (Phase 1 전체 PASS 조건)

- [ ] `npm test` 42 tests PASS (Phase 0 29 + 신규 13)
- [ ] `npm run build` 성공
- [ ] `npm run lint` clean
- [ ] /tamagotchi, /sprites 라우트 빌드 결과에서 사라짐
- [ ] `grep -rn "tamagotchi\|sprites\|RoutineParty\|Press Start 2P" src/` 결과 0건
- [ ] /home에서 KPI/메모/루틴 카드 정상 노출, 빠른메모 input → 저장 → /memo에 즉시 반영
- [ ] BottomNav 5탭 (홈/가계부/메모/일기/루틴) 정상, 활성 탭 색 변경
- [ ] /memo, /memo?tab=curation 둘 다 정상
- [ ] 기존 페이지(/budget /diary /routine /login) 깨지지 않고 작동 (디자인은 Phase 1.5에서)
- [ ] Supabase Advisor Critical 0건 유지
- [ ] `tamagotchi_state` SQL drop 후에도 어떤 페이지도 깨지지 않음

---

## 자체 점검 결과 (Self-Review, 작성자 기록)

**Spec coverage:**
- Task 1-1 (디자인 토큰) → Plan Task 3
- Task 1-2 (다마고치 코드 폐기) → Plan Task 1
- Task 1-3 (DB drop SQL) → Plan Task 2
- Task 1-4 (BottomNav) → Plan Task 4
- Task 1-5 (홈 재작성) → Plan Tasks 5a~5h (8개로 분해)
- Task 1-6 (메모 탭 분기) → Plan Task 6
- Task 1-7 (회귀 점검) → Plan Task 8
- Task 1-8 (design-tokens.md) → Plan Task 7

모든 spec 항목 커버됨.

**Placeholder scan:** 없음. 모든 step에 실제 코드 또는 명확한 명령.

**Type consistency:**
- `BudgetSummary` (lib/budget/summary.ts) ↔ HomeKPICard 인자 — 일치
- `TodayRoutine` (lib/routine/today.ts) ↔ HomeRoutineCard 인자 — 일치
- `RecentMemo` (lib/memo/recent.ts) ↔ HomeMemoCard memos prop — 일치
- `QuickMemoResult` (actions.ts) — Server Action 반환, HomeMemoCard에서 result.ok 접근 — 일치
- `MEMO_TAGS[0]` 상수 사용 (constants.ts에 정의돼있음) — 일치
- `TAG_COLORS` import (memoColors.ts) — 기존 파일, 일치

타입 일관성 OK.
