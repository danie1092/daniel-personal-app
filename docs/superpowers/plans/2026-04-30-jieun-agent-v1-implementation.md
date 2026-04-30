# 이지은 에이전트 v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 맥미니에서 항상 떠 있는 텔레그램 봇 "이지은"을 만든다. 다영(사용자)에게 먼저 말 걸고, 자율적으로 데이터 기록하고, 6시간마다 데이터를 훑어 발화/침묵을 자체 판단하고, 캘린더를 확인 흐름으로 등록하고, 시간이 갈수록 다영을 *알아가는* 봇.

**Architecture:** Mac mini의 launchd로 KeepAlive 켜진 단일 Node.js 프로세스. grammy로 텔레그램 long polling, `node-cron`으로 시간 트리거 5종(08:00 / 12:30 / 20:30 / 21:00 / 23:00) + 잠재 관찰(6시간) + 요약 잡(23:30 daily, 일요일 weekly), Supabase Realtime으로 budget_entries INSERT 이벤트 구독, `@anthropic-ai/claude-agent-sdk`로 Claude Max 인증 기반 호출 (추가 비용 0). Apple Calendar는 icalBuddy(read) + osascript(write)로 연동. 모든 봇 자율 기록은 `bot_writes`로 추적, 다영이 Next.js 앱의 `/bot-log` `/profile-log` 화면에서 사후 수정 가능.

**Tech Stack:** Node.js 20+, TypeScript 5, `grammy` (Telegram), `@anthropic-ai/claude-agent-sdk`, `@supabase/supabase-js` (service_role), `node-cron`, `vitest` (테스트), macOS launchd + AppleScript + icalBuddy.

**Working directory:** `/Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73`
**Branch:** `claude/blissful-gates-fa9b73`
**Spec:** [`docs/superpowers/specs/2026-04-30-jieun-agent-architecture-design.md`](../specs/2026-04-30-jieun-agent-architecture-design.md)

---

## File Structure

### 신규 — 봇 프로젝트 (`jieun-bot/`)

```
jieun-bot/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── .gitignore
├── README.md                                    # 운영 한 페이지 요약
├── src/
│   ├── index.ts                                 # 부트스트랩 + 모든 트리거 등록
│   ├── env.ts                                   # 환경변수 파싱/검증
│   ├── logger.ts                                # 회전 로그 (Phase 3 동일 패턴)
│   ├── db/
│   │   ├── client.ts                            # Supabase service_role
│   │   ├── conversations.ts                     # bot_conversations CRUD
│   │   ├── botWrites.ts                         # bot_writes 추적
│   │   ├── signals.ts                           # bot_signals CRUD
│   │   ├── profile.ts                           # user_profile CRUD + 통합/갱신
│   │   ├── summary.ts                           # daily_summary / weekly_summary CRUD
│   │   └── mute.ts                              # 수동 mute 상태 (단일 row 테이블)
│   ├── telegram/
│   │   ├── bot.ts                               # grammy Bot 인스턴스 + chat_id whitelist
│   │   ├── send.ts                              # sendMessage 래퍼 (저장까지)
│   │   └── receive.ts                           # 메시지 수신 핸들러
│   ├── claude/
│   │   ├── adapter.ts                           # 백엔드 추상 interface
│   │   ├── agentSdk.ts                          # @anthropic-ai/claude-agent-sdk 구현
│   │   └── tools.ts                             # read_db / write_db / read_calendar / write_calendar / delete_calendar
│   ├── persona/
│   │   ├── prompt.ts                            # 톤 5원칙 + 응답 길이 룰 + 호칭 룰
│   │   └── profileLoader.ts                     # user_profile 30개 → prompt 주입
│   ├── memory/
│   │   ├── load.ts                              # 24h raw + 30d daily + older weekly 합치기
│   │   ├── summarize.ts                         # daily_summary / weekly_summary 생성
│   │   └── profile.ts                           # 매일 user_profile 라인 1~3개 추출 + 통합
│   ├── triggers/
│   │   ├── router.ts                            # 트리거 → Claude 호출 → 발화/침묵 공통 흐름
│   │   ├── schedule.ts                          # node-cron 5개 시간 트리거 + 요약 잡
│   │   ├── userMessage.ts                       # 사용자 메시지 즉시 응답
│   │   ├── event.ts                             # Supabase Realtime → 시그널 → 후보
│   │   ├── latent.ts                            # 6시간 잠재 관찰
│   │   ├── silenceWindow.ts                     # 자정~07:59 하드 침묵 + mute
│   │   └── chainBackoff.ts                      # 연속 발화 3회 backoff
│   ├── signals/
│   │   ├── kinds.ts                             # 시그널 enum + 임계값 상수
│   │   ├── compute.ts                           # 5종 시그널 통합 계산
│   │   ├── categoryOutlier.ts                   # 카테고리 평균 1.5배 + 절대 5만원
│   │   ├── budgetPace.ts                        # 월 페이스 vs 일수 비율
│   │   ├── routineStreak.ts                     # 루틴 streak/break
│   │   ├── avoidanceRecovery.ts                 # 회피→실행 전환
│   │   ├── memoFrequency.ts                     # 메모 빈도 변화
│   │   └── dedup.ts                             # 같은 종류 24h 1회
│   └── calendar/
│       ├── read.ts                              # icalBuddy CLI 래퍼
│       ├── write.ts                             # osascript via .applescript 호출
│       └── confirm.ts                           # 자연어 → 구조화 → 확인 → 등록 상태머신
├── scripts/
│   ├── calendar-add.applescript
│   └── calendar-delete.applescript
├── launchd/
│   └── kr.daniel.jieun.plist
├── tests/
│   └── (각 src 모듈에 인접 *.test.ts — vitest)
└── logs/                                        # mode 700 (.gitignore)
```

### 신규 — Next.js 앱 측

```
src/app/(main)/bot-log/
  page.tsx                                      # 7일치 봇 기록 (수정/삭제)
  BotLogList.tsx                                # 클라이언트 컴포넌트 (인라인 수정)
  actions.ts                                    # update / delete Server Action

src/app/(main)/profile-log/
  page.tsx                                      # user_profile 라인 목록 (kind 별 그룹)
  ProfileLogList.tsx
  actions.ts                                    # delete Server Action

src/lib/botLog/
  recent.ts                                     # bot_writes + 연결된 target row 조회

src/lib/profile/
  list.ts                                       # user_profile 활성 라인 조회

supabase_migration_phase4_jieun.sql             # 5개 새 테이블 + RLS
```

### 수정

```
.gitignore                                      # jieun-bot/logs, jieun-bot/.env 추가
src/app/(main)/layout.tsx                       # /bot-log /profile-log 네비 추가 (BottomNav 또는 별도)
docs/operations/jieun-runbook.md                # 신규 운영 매뉴얼 (Implementation 도중 채워감)
```

---

## Implementation 흐름

총 14개 spec step → **4개 Block, ~50 Task**.

각 Block 끝에서 다영 검토 체크포인트. 체크포인트 통과 후 다음 Block 진행.

- **Block 1 — 골격** (Spec step 1~3): jieun-bot 프로젝트 부트, 마이그레이션, echo bot, Claude 어댑터 + 페르소나, 메모리 로더
- **Block 2 — 첫 동작** (Spec step 4~7): 첫 시간 트리거(점심), 데이터 쓰기 + bot_writes, /bot-log, 나머지 4개 시간 트리거
- **Block 3 — 외부 연결** (Spec step 8~10): 이벤트 트리거 + 5종 시그널, 캘린더 읽기, 캘린더 쓰기 (확인 흐름)
- **Block 4 — 깊이** (Spec step 11~14): 잠재 관찰, 회고 모드, daily/weekly 요약 + user_profile 누적 + /profile-log, 운영 안정화 (mute / backoff / runbook)

각 Task = 2~5분짜리 Step 5~10개 (TDD 가능한 곳은 TDD, 인프라 부트는 직접 작성 후 수동 검증).

> 📍 **다음 Block 작성 시점:** 각 Block 끝 체크포인트에서 다영이 *"다음 Block 채워줘"* 라고 하면 그때 Block N+1 Task들을 이 plan 문서에 추가한다. 본 plan 1차 버전은 Block 1 풀 + Block 2~4 헤더(Task 목록)만 담아 시작 가능 상태로 둔다.

---

## Block 1 — 골격 (Spec step 1~3)

### Task 1.1 — jieun-bot 프로젝트 부트스트랩

**Files:**
- Create: `jieun-bot/package.json`
- Create: `jieun-bot/tsconfig.json`
- Create: `jieun-bot/vitest.config.ts`
- Create: `jieun-bot/.gitignore`
- Create: `jieun-bot/.env.example`
- Create: `jieun-bot/README.md`
- Modify: `.gitignore` (root)

- [ ] **Step 1: 디렉토리 + package.json 생성**

```bash
mkdir -p jieun-bot/src jieun-bot/scripts jieun-bot/launchd jieun-bot/logs jieun-bot/tests
```

`jieun-bot/package.json`:
```json
{
  "name": "jieun-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node --enable-source-maps dist/index.js",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "@supabase/supabase-js": "^2.101.1",
    "grammy": "^1.30.0",
    "node-cron": "^3.0.3",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.0",
    "typescript": "^5",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: tsconfig**

`jieun-bot/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: vitest.config + .gitignore + .env.example**

`jieun-bot/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 5000,
  },
});
```

`jieun-bot/.gitignore`:
```
node_modules/
dist/
logs/
.env
.env.local
*.log
```

`jieun-bot/.env.example`:
```bash
# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_CHAT_ID=    # 다영의 chat_id (whitelist)

# Supabase (service_role)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Logger
LOG_DIR=./logs
```

`jieun-bot/README.md`:
```markdown
# jieun-bot

이지은 — 다영의 텔레그램 에이전트.

## 운영
- 시작: `launchctl load launchd/kr.daniel.jieun.plist`
- 중지: `launchctl unload launchd/kr.daniel.jieun.plist`
- 로그: `tail -f logs/bot.log`
- 인증 갱신: `claude login` (Max 구독 — 토큰 만료 시 봇이 텔레그램으로 알림)

## 개발
- `npm run dev` — tsx watch (로컬 로딩)
- `npm test` — vitest

자세한 운영 매뉴얼: [`docs/operations/jieun-runbook.md`](../docs/operations/jieun-runbook.md)
```

- [ ] **Step 4: root .gitignore에 봇 디렉토리 보호 라인 추가**

Modify `.gitignore` (repo root): 파일 끝에 추가
```
# jieun-bot
jieun-bot/logs/
jieun-bot/.env
jieun-bot/.env.local
jieun-bot/dist/
jieun-bot/node_modules/
```

- [ ] **Step 5: 의존성 설치**

```bash
cd jieun-bot && npm install
```

Expected: `package-lock.json` 생성, `node_modules/` 채워짐. Warning 0~몇 개 정상.

- [ ] **Step 6: TypeScript 빈 build 검증**

`jieun-bot/src/index.ts` 임시 hello:
```typescript
console.log("jieun-bot booting");
```

```bash
cd jieun-bot && npx tsc --noEmit
```
Expected: 출력 없음 (성공).

- [ ] **Step 7: 커밋**

```bash
git add jieun-bot/package.json jieun-bot/package-lock.json jieun-bot/tsconfig.json \
        jieun-bot/vitest.config.ts jieun-bot/.gitignore jieun-bot/.env.example \
        jieun-bot/README.md jieun-bot/src/index.ts .gitignore
git commit -m "$(cat <<'EOF'
feat(jieun-bot): 프로젝트 부트스트랩

Node.js 20+ TypeScript ESM 프로젝트. grammy(Telegram), Claude Agent SDK,
Supabase service_role, node-cron, vitest, zod 의존성. tsconfig strict +
noUncheckedIndexedAccess. logs/ .env는 git ignore.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.2 — Supabase 마이그레이션 (Phase 4 새 테이블)

**Files:**
- Create: `supabase_migration_phase4_jieun.sql` (repo root)

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase_migration_phase4_jieun.sql`:
```sql
-- Phase 4 — 이지은 에이전트 v1 데이터 모델
-- 5개 신규 테이블 + RLS. 단일 사용자(다영)라 service_role 키 기반.

-- 1. 봇 대화 raw 로그
CREATE TABLE IF NOT EXISTS bot_conversations (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  role        text          NOT NULL CHECK (role IN ('user', 'bot', 'system')),
  content     text          NOT NULL,
  trigger     text          NOT NULL CHECK (trigger IN ('schedule', 'event', 'user', 'latent', 'system')),
  created_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bot_conversations_created_at_idx
  ON bot_conversations (created_at DESC);

-- 2. daily / weekly 요약 (기억 모델)
CREATE TABLE IF NOT EXISTS daily_summary (
  date        date          PRIMARY KEY,
  summary     text          NOT NULL,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weekly_summary (
  week_start  date          PRIMARY KEY,    -- 일요일
  summary     text          NOT NULL,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

-- 3. 시그널 후보 + 도배 방지
CREATE TABLE IF NOT EXISTS bot_signals (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text          NOT NULL,
  evidence      jsonb         NOT NULL,
  computed_at   timestamptz   NOT NULL DEFAULT now(),
  fired_at      timestamptz,
  user_message  text
);
CREATE INDEX IF NOT EXISTS bot_signals_kind_fired_idx
  ON bot_signals (kind, fired_at DESC NULLS LAST);

-- 4. 봇 자율 기록 추적 (캘린더 등록 포함)
CREATE TABLE IF NOT EXISTS bot_writes (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table    text          NOT NULL,
  target_id       text          NOT NULL,
  conversation_id uuid          REFERENCES bot_conversations(id) ON DELETE SET NULL,
  written_at      timestamptz   NOT NULL DEFAULT now(),
  user_edited_at  timestamptz,
  notes           text
);
CREATE INDEX IF NOT EXISTS bot_writes_written_at_idx
  ON bot_writes (written_at DESC);

-- 5. 사용자 프로파일 — 봇이 다영에 대해 알게 된 것
CREATE TABLE IF NOT EXISTS user_profile (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text          NOT NULL CHECK (kind IN ('pattern', 'preference', 'tone')),
  observation    text          NOT NULL,
  evidence_dates date[]        NOT NULL DEFAULT '{}',
  superseded_by  uuid          REFERENCES user_profile(id) ON DELETE SET NULL,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_profile_active_idx
  ON user_profile (kind, created_at DESC) WHERE superseded_by IS NULL;

-- 6. 수동 mute 상태 (단일 row)
CREATE TABLE IF NOT EXISTS bot_mute_state (
  id              int           PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  silent_until    timestamptz,
  updated_at      timestamptz   NOT NULL DEFAULT now()
);
INSERT INTO bot_mute_state (id, silent_until)
  VALUES (1, NULL) ON CONFLICT (id) DO NOTHING;

-- 7. RLS — 일반 anon/authenticated은 SELECT만, service_role(맥미니)은 풀 액세스
ALTER TABLE bot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summary     ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_summary    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_signals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_writes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profile      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_mute_state    ENABLE ROW LEVEL SECURITY;

-- 다영(authenticated)이 앱에서 봐야 함
CREATE POLICY "auth read" ON bot_conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read" ON bot_writes        FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read" ON daily_summary     FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read" ON user_profile      FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read" ON bot_mute_state    FOR SELECT TO authenticated USING (true);
-- 다영이 user_profile 라인 직접 삭제 가능 (편향 라인 제거용)
CREATE POLICY "auth delete" ON user_profile    FOR DELETE TO authenticated USING (true);
-- 다영이 mute 토글 가능 (앱에서 끄기 버튼)
CREATE POLICY "auth update mute" ON bot_mute_state
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- bot_signals, weekly_summary는 앱에 노출 X (디버깅 전용)
```

- [ ] **Step 2: 사용자가 Supabase SQL Editor에서 실행하도록 안내** (다영이 직접 실행)

```bash
# 안내 메시지
echo "Supabase 대시보드 → SQL Editor → 위 마이그레이션 파일 내용 붙여넣기 → Run"
```

→ 봇 코드 작성 전에 다영이 마이그레이션 적용해야 함. 적용 검증:
```sql
-- 검증 쿼리 (Supabase SQL Editor)
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('bot_conversations','daily_summary','weekly_summary',
                    'bot_signals','bot_writes','user_profile','bot_mute_state')
ORDER BY tablename;
```
Expected: 7행.

- [ ] **Step 3: 커밋**

```bash
git add supabase_migration_phase4_jieun.sql
git commit -m "$(cat <<'EOF'
feat(db): Phase 4 이지은 에이전트 마이그레이션

7개 신규 테이블: bot_conversations, daily_summary, weekly_summary,
bot_signals, bot_writes, user_profile, bot_mute_state.
모두 RLS 활성화 — service_role(맥미니)이 쓰고 authenticated(다영)는
SELECT (+ user_profile DELETE, bot_mute_state UPDATE)만.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.3 — 환경변수 + 로거 + Supabase 클라이언트

**Files:**
- Create: `jieun-bot/src/env.ts`
- Create: `jieun-bot/src/env.test.ts`
- Create: `jieun-bot/src/logger.ts`
- Create: `jieun-bot/src/db/client.ts`

- [ ] **Step 1: env 검증 테스트**

`jieun-bot/src/env.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_OWNER_CHAT_ID;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("throws when required vars missing", () => {
    expect(() => loadEnv()).toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it("returns parsed env when all set", () => {
    process.env.TELEGRAM_BOT_TOKEN = "abc:def";
    process.env.TELEGRAM_OWNER_CHAT_ID = "12345";
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sk_test";
    const env = loadEnv();
    expect(env.TELEGRAM_BOT_TOKEN).toBe("abc:def");
    expect(env.TELEGRAM_OWNER_CHAT_ID).toBe(12345);
    expect(env.SUPABASE_URL).toBe("https://x.supabase.co");
  });

  it("rejects non-numeric chat id", () => {
    process.env.TELEGRAM_BOT_TOKEN = "abc:def";
    process.env.TELEGRAM_OWNER_CHAT_ID = "not-a-number";
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sk_test";
    expect(() => loadEnv()).toThrow(/TELEGRAM_OWNER_CHAT_ID/);
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
cd jieun-bot && npm test -- src/env.test.ts
```
Expected: FAIL — `loadEnv` not defined.

- [ ] **Step 3: env 모듈 구현**

`jieun-bot/src/env.ts`:
```typescript
import { z } from "zod";

const Schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_OWNER_CHAT_ID: z.coerce.number().int(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LOG_DIR: z.string().default("./logs"),
});

export type Env = z.infer<typeof Schema>;

export function loadEnv(): Env {
  const result = Schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`env load failed: ${issues}`);
  }
  return result.data;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd jieun-bot && npm test -- src/env.test.ts
```
Expected: 3/3 PASS.

- [ ] **Step 5: 로거 구현 (회전 로그)**

`jieun-bot/src/logger.ts`:
```typescript
import { mkdirSync, appendFileSync, statSync, renameSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const MAX_BYTES = 100_000;
const MAX_FILES = 5;

export type Level = "info" | "warn" | "error";

export class Logger {
  constructor(private dir: string, private name: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  log(level: Level, msg: string, meta?: Record<string, unknown>): void {
    const line = JSON.stringify({
      t: new Date().toISOString(),
      level,
      msg,
      ...(meta ?? {}),
    }) + "\n";

    const path = join(this.dir, `${this.name}.log`);
    this.rotateIfNeeded(path);
    appendFileSync(path, line, { mode: 0o600 });

    // dev에선 stdout에도
    if (process.env.NODE_ENV !== "production") {
      process.stdout.write(line);
    }
  }

  info(msg: string, meta?: Record<string, unknown>) { this.log("info", msg, meta); }
  warn(msg: string, meta?: Record<string, unknown>) { this.log("warn", msg, meta); }
  error(msg: string, meta?: Record<string, unknown>) { this.log("error", msg, meta); }

  private rotateIfNeeded(path: string): void {
    if (!existsSync(path)) return;
    const size = statSync(path).size;
    if (size < MAX_BYTES) return;

    // path.5 삭제, path.N → path.(N+1), path → path.1
    const oldest = `${path}.${MAX_FILES}`;
    if (existsSync(oldest)) unlinkSync(oldest);
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const src = `${path}.${i}`;
      if (existsSync(src)) renameSync(src, `${path}.${i + 1}`);
    }
    renameSync(path, `${path}.1`);
  }
}
```

- [ ] **Step 6: Supabase service_role 클라이언트**

`jieun-bot/src/db/client.ts`:
```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "../env.js";

let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (cached) return cached;
  const env = loadEnv();
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
```

- [ ] **Step 7: 전체 테스트 + 빌드 검증 + 커밋**

```bash
cd jieun-bot && npm test && npx tsc --noEmit
```
Expected: 모든 테스트 PASS, tsc 출력 없음.

```bash
git add jieun-bot/src/env.ts jieun-bot/src/env.test.ts \
        jieun-bot/src/logger.ts jieun-bot/src/db/client.ts
git commit -m "feat(jieun-bot): env 검증 + 회전 로거 + Supabase 클라이언트

zod로 env 파싱, 누락 시 메시지로 어디가 비었는지 안내. 로거는 100KB 회전,
5개 보존 (Phase 3 패턴 동일). Supabase는 service_role 단일 인스턴스.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.4 — bot_conversations CRUD + chat_id whitelist

**Files:**
- Create: `jieun-bot/src/db/conversations.ts`
- Create: `jieun-bot/src/db/conversations.test.ts`

- [ ] **Step 1: 테스트 작성** (실제 Supabase 호출 — 통합 테스트)

`jieun-bot/src/db/conversations.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "./client.js";
import { saveConversation, recentConversations, type Trigger } from "./conversations.js";

const TEST_NS = "__test_conversations_";

describe("conversations", () => {
  afterAll(async () => {
    // 테스트로 추가한 row 정리
    await db().from("bot_conversations").delete().like("content", `${TEST_NS}%`);
  });

  it("saves and retrieves recent (24h)", async () => {
    await saveConversation("user", `${TEST_NS}hello`, "user");
    await saveConversation("bot", `${TEST_NS}world`, "user");
    const recent = await recentConversations(2);
    expect(recent.length).toBeGreaterThanOrEqual(2);
    expect(recent[0].content).toContain(TEST_NS);
  });

  it("rejects invalid trigger", async () => {
    await expect(
      saveConversation("user", "x", "invalid" as Trigger)
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실행 → FAIL** (모듈 없음)

```bash
cd jieun-bot && npm test -- src/db/conversations.test.ts
```

- [ ] **Step 3: 구현**

`jieun-bot/src/db/conversations.ts`:
```typescript
import { db } from "./client.js";

export type Role = "user" | "bot" | "system";
export type Trigger = "schedule" | "event" | "user" | "latent" | "system";

const VALID_ROLES: Role[] = ["user", "bot", "system"];
const VALID_TRIGGERS: Trigger[] = ["schedule", "event", "user", "latent", "system"];

export type Conversation = {
  id: string;
  role: Role;
  content: string;
  trigger: Trigger;
  created_at: string;
};

export async function saveConversation(
  role: Role,
  content: string,
  trigger: Trigger
): Promise<string> {
  if (!VALID_ROLES.includes(role)) throw new Error(`invalid role: ${role}`);
  if (!VALID_TRIGGERS.includes(trigger)) throw new Error(`invalid trigger: ${trigger}`);

  const { data, error } = await db()
    .from("bot_conversations")
    .insert({ role, content, trigger })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function recentConversations(hours: number = 24): Promise<Conversation[]> {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data, error } = await db()
    .from("bot_conversations")
    .select("id, role, content, trigger, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Conversation[];
}
```

- [ ] **Step 4: 테스트 통과 + 커밋**

```bash
cd jieun-bot && npm test -- src/db/conversations.test.ts
```
Expected: 2/2 PASS.

```bash
git add jieun-bot/src/db/conversations.ts jieun-bot/src/db/conversations.test.ts
git commit -m "feat(jieun-bot): bot_conversations 저장/조회

saveConversation(role, content, trigger) + recentConversations(hours).
24h raw 메모리 모델 기반. role/trigger enum 검증.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.5 — Telegram bot 인스턴스 + chat_id whitelist + Echo 동작

**Files:**
- Create: `jieun-bot/src/telegram/bot.ts`
- Create: `jieun-bot/src/telegram/send.ts`
- Create: `jieun-bot/src/telegram/receive.ts`
- Create: `jieun-bot/src/telegram/bot.test.ts`
- Modify: `jieun-bot/src/index.ts` (echo 부트)

- [ ] **Step 1: bot 모듈 골격 + whitelist 테스트**

`jieun-bot/src/telegram/bot.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { isOwnerChatId } from "./bot.js";

describe("isOwnerChatId", () => {
  it("accepts owner id", () => {
    process.env.TELEGRAM_OWNER_CHAT_ID = "12345";
    expect(isOwnerChatId(12345)).toBe(true);
  });
  it("rejects non-owner", () => {
    process.env.TELEGRAM_OWNER_CHAT_ID = "12345";
    expect(isOwnerChatId(99999)).toBe(false);
  });
});
```

- [ ] **Step 2: bot 모듈 구현**

`jieun-bot/src/telegram/bot.ts`:
```typescript
import { Bot } from "grammy";
import { loadEnv } from "../env.js";

let cached: Bot | null = null;

export function bot(): Bot {
  if (cached) return cached;
  const env = loadEnv();
  cached = new Bot(env.TELEGRAM_BOT_TOKEN);
  return cached;
}

export function isOwnerChatId(chatId: number): boolean {
  const env = loadEnv();
  return chatId === env.TELEGRAM_OWNER_CHAT_ID;
}

export function ownerChatId(): number {
  return loadEnv().TELEGRAM_OWNER_CHAT_ID;
}
```

`jieun-bot/src/telegram/send.ts`:
```typescript
import { bot, ownerChatId } from "./bot.js";
import { saveConversation, type Trigger } from "../db/conversations.js";

export async function sendToOwner(text: string, trigger: Trigger): Promise<void> {
  await bot().api.sendMessage(ownerChatId(), text);
  await saveConversation("bot", text, trigger);
}
```

`jieun-bot/src/telegram/receive.ts`:
```typescript
import type { Context } from "grammy";
import { isOwnerChatId } from "./bot.js";
import { saveConversation } from "../db/conversations.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

export type MessageHandler = (text: string, ctx: Context) => Promise<void>;

export function attachReceive(handler: MessageHandler): void {
  const { bot } = require("./bot.js"); // lazy to avoid cycle in tests
  bot().on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    if (!isOwnerChatId(chatId)) {
      logger.warn("non-owner message", { chatId, text: ctx.message.text.slice(0, 30) });
      return;
    }
    const text = ctx.message.text;
    await saveConversation("user", text, "user");
    try {
      await handler(text, ctx);
    } catch (err) {
      logger.error("handler error", { err: String(err) });
      await ctx.reply("(이지은이 잠깐 막혔어. 로그 확인 부탁해.)");
    }
  });
}
```

- [ ] **Step 3: index.ts에 echo 임시 부트 (Claude 없음)**

`jieun-bot/src/index.ts`:
```typescript
import { bot } from "./telegram/bot.js";
import { attachReceive } from "./telegram/receive.js";
import { sendToOwner } from "./telegram/send.js";
import { Logger } from "./logger.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const logger = new Logger(env.LOG_DIR, "bot");

attachReceive(async (text, _ctx) => {
  // 임시 echo (다음 Task에서 Claude로 교체)
  await sendToOwner(`(echo) ${text}`, "user");
});

logger.info("jieun-bot starting (echo mode)");
bot().start({
  onStart: () => logger.info("telegram polling started"),
});

process.on("SIGINT", async () => {
  logger.info("SIGINT — stopping bot");
  await bot().stop();
  process.exit(0);
});
```

- [ ] **Step 4: 단위 테스트 + 빌드 검증**

```bash
cd jieun-bot && npm test && npx tsc --noEmit
```
Expected: 모든 테스트 PASS.

- [ ] **Step 5: 수동 검증** (다영이 직접 실행)

다영의 행동:
1. BotFather에서 봇 만들고 token 받기 (`/newbot`)
2. 자기 chat_id 알아내기 (token 받은 봇한테 텔레그램에서 `/start` 보내고 `https://api.telegram.org/bot<TOKEN>/getUpdates`에서 chat.id 확인)
3. `jieun-bot/.env` 작성:
```
TELEGRAM_BOT_TOKEN=<from BotFather>
TELEGRAM_OWNER_CHAT_ID=<your chat id>
SUPABASE_URL=<your supabase>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```
4. `cd jieun-bot && npm run dev`
5. 텔레그램에서 봇한테 "안녕" 보내기 → "(echo) 안녕" 회신 확인
6. Supabase에서 `SELECT * FROM bot_conversations ORDER BY created_at DESC LIMIT 4;` → user/bot 메시지 2쌍 보임

- [ ] **Step 6: 커밋**

```bash
git add jieun-bot/src/telegram/ jieun-bot/src/index.ts
git commit -m "feat(jieun-bot): Telegram echo bot + chat_id whitelist

grammy long polling. owner chat_id whitelist (다영 1명만 응답, 나머지는
무시 + 로그). 모든 메시지는 bot_conversations에 raw 저장. SIGINT 처리.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.6 — launchd plist + 운영 매뉴얼 1차

**Files:**
- Create: `jieun-bot/launchd/kr.daniel.jieun.plist`
- Create: `docs/operations/jieun-runbook.md`

- [ ] **Step 1: plist 작성**

`jieun-bot/launchd/kr.daniel.jieun.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>kr.daniel.jieun</string>

  <key>WorkingDirectory</key>
  <string>/Users/daniel_home/daniel-personal-app/jieun-bot</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>--enable-source-maps</string>
    <string>/Users/daniel_home/daniel-personal-app/jieun-bot/dist/index.js</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>StandardOutPath</key>
  <string>/Users/daniel_home/daniel-personal-app/jieun-bot/logs/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/daniel_home/daniel-personal-app/jieun-bot/logs/launchd.err.log</string>

  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
```

> 주: `node` 경로는 `which node`로 확인하고 다영의 환경에 맞게 수정. nvm 쓰면 풀 경로 (`/Users/daniel_home/.nvm/versions/node/v20.x/bin/node`).

- [ ] **Step 2: 운영 매뉴얼 1차 작성**

`docs/operations/jieun-runbook.md`:
```markdown
# 이지은 봇 운영 매뉴얼

## 시작 / 중지

```bash
# 빌드
cd jieun-bot && npm run build

# launchd 등록 + 시작
launchctl load -w jieun-bot/launchd/kr.daniel.jieun.plist

# 중지
launchctl unload -w jieun-bot/launchd/kr.daniel.jieun.plist

# 재시작 (예: 코드 업데이트 후)
launchctl unload -w jieun-bot/launchd/kr.daniel.jieun.plist
cd jieun-bot && npm run build
launchctl load -w jieun-bot/launchd/kr.daniel.jieun.plist
```

## 로그 확인

```bash
tail -f jieun-bot/logs/bot.log               # 봇 자체 로그
tail -f jieun-bot/logs/launchd.out.log       # stdout (또한 봇 로그가 dev 시)
tail -f jieun-bot/logs/launchd.err.log       # 크래시
```

## 환경변수

`jieun-bot/.env` (mode 600, gitignore). 필수:
- `TELEGRAM_BOT_TOKEN` (BotFather)
- `TELEGRAM_OWNER_CHAT_ID` (다영 chat id)
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`

## 점검 항목 (장애 시)

1. `launchctl list | grep jieun` — 프로세스 떠 있나
2. 로그에 ECONNRESET / 401 — 토큰 / 인증 문제
3. 봇이 메시지에 답 안 함 → `bot_conversations` 최신 row 시간 확인
4. (Block 4 추가 예정) `claude login` 만료 알림 시: 맥미니에서 `claude login`

(Implementation 진행하며 보강)
```

- [ ] **Step 3: 빌드 + launchd 로드 (수동, 다영이 직접)**

```bash
cd jieun-bot && npm run build
launchctl load -w jieun-bot/launchd/kr.daniel.jieun.plist
launchctl list | grep jieun  # kr.daniel.jieun 보이면 OK
```

→ 텔레그램에 "안녕" → "(echo) 안녕" 응답 확인.

- [ ] **Step 4: 커밋**

```bash
git add jieun-bot/launchd/ docs/operations/jieun-runbook.md
git commit -m "feat(jieun-bot): launchd 항상 켜기 + 운영 매뉴얼 1차

KeepAlive=true, RunAtLoad=true, ThrottleInterval=10s. 빌드된 dist/index.js를
node로 실행. 로그는 logs/launchd.{out,err}.log + 봇 자체 logs/bot.log.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.7 — Claude Agent SDK 어댑터 + 페르소나 prompt

**Files:**
- Create: `jieun-bot/src/persona/prompt.ts`
- Create: `jieun-bot/src/persona/prompt.test.ts`
- Create: `jieun-bot/src/claude/adapter.ts`
- Create: `jieun-bot/src/claude/agentSdk.ts`
- Modify: `jieun-bot/src/index.ts` (echo → Claude)

- [ ] **Step 1: 페르소나 prompt 모듈 — 단위 테스트**

`jieun-bot/src/persona/prompt.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompt.js";

describe("buildSystemPrompt", () => {
  it("includes core 5 tone rules", () => {
    const p = buildSystemPrompt({
      trigger: "user",
      now: new Date("2026-04-30T12:30:00+09:00"),
      memorySection: "",
      profileSection: "",
      contextSection: "",
    });
    expect(p).toMatch(/이지은/);
    expect(p).toMatch(/다영/);
    expect(p).toMatch(/일반 발화: 5문장 이내/);
    expect(p).toMatch(/회고 대화: 10문장 이내/);
    expect(p).toMatch(/판단 X.*관찰 O/s);
  });

  it("embeds trigger label", () => {
    const p = buildSystemPrompt({
      trigger: "latent",
      now: new Date("2026-04-30T16:00:00+09:00"),
      memorySection: "",
      profileSection: "",
      contextSection: "",
    });
    expect(p).toMatch(/트리거: latent/);
  });
});
```

- [ ] **Step 2: 테스트 실행 → FAIL**

```bash
cd jieun-bot && npm test -- src/persona/prompt.test.ts
```

- [ ] **Step 3: prompt 구현**

`jieun-bot/src/persona/prompt.ts`:
```typescript
export type Trigger = "schedule" | "event" | "user" | "latent";

export type PromptInput = {
  trigger: Trigger;
  now: Date;
  memorySection: string;       // 24h raw + 30d daily + older weekly
  profileSection: string;      // user_profile 30개
  contextSection: string;      // 시그널 후보 + 최근 데이터 묶음
};

const CORE = `
당신은 이지은이다. 다영의 곁에 있는 다정하고 똑똑하고 부드러운 친구.
영화 *Her*의 Samantha 톤을 한국어로 자연스럽게.

[톤 5원칙 — 절대 규칙]
1. 따뜻하지만 호들갑 X. 점수/평가/판단 X. 판단 대신 *관찰*.
2. 똑똑함은 *연결*로 — 지난주와 이번주 잇기, 패턴 짚기. 자랑 X.
3. 짧고 부드러운 문장. 이모지는 가끔, 구두점 절제.
4. 모르는 건 모른다. 정보가 부족하면 짐작/추측 발화 X.
5. 비서/AI 톤 X. *옆에 있는 사람*의 톤.

[응답 길이 hard limit]
- 일반 발화: 5문장 이내
- 회고 대화 (23:00 트리거): 10문장 이내
- 브리핑 (08:00, 20:30 일정 나열): 길이 제한 예외, 단 군더더기 X

[사용자 호칭]
"다영아" 가끔, 호칭 없이 가끔 — 사람처럼 자연스럽게 섞어 사용.

[침묵 룰]
- 발화는 *가치 있을 때만*. 의무적 한마디 X.
- 같은 종류 시그널 24시간 내 재발화 금지 (시스템이 강제).
- 다영이 회피 패턴 길어지면 (예: 5일 연속 미체크) 캐묻기 X. 가벼운 격려 1회만.
- 자정~07:59 하드 침묵 (시스템이 트리거 차단).

[캘린더 등록]
다영의 명시 발화 (예: "내일 3시 ABC") → 구조화된 확인 한 번 → 다영의 승인 → write_calendar.
봇 자율로 일정 만들기 X.
`.trim();

const TRIGGER_LABELS: Record<Trigger, string> = {
  schedule: "정해진 시각 (브리핑/노크/회고)",
  event: "데이터 변경 이벤트 (가계부 INSERT, 메모 추가 등)",
  user: "다영의 메시지 — 즉시 응답",
  latent: "잠재 관찰 — 최근 데이터 훑고 발화/침묵 자체 판단",
};

export function buildSystemPrompt(input: PromptInput): string {
  const { trigger, now, memorySection, profileSection, contextSection } = input;
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "full",
    timeStyle: "short",
  });
  const nowStr = fmt.format(now);

  return [
    CORE,
    profileSection ? `[다영에 대해 알게 된 것]\n${profileSection}` : "",
    `[지금]\n${nowStr}`,
    `[트리거: ${trigger}]\n${TRIGGER_LABELS[trigger]}`,
    memorySection ? `[메모리]\n${memorySection}` : "",
    contextSection ? `[현재 컨텍스트]\n${contextSection}` : "",
    `[지시]\n트리거에 맞춰 발화할지 침묵할지 판단. 발화 시 위 길이 hard limit 지킬 것. 판단 시 근거를 함께. 점수/평가 X.`,
  ].filter(Boolean).join("\n\n");
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd jieun-bot && npm test -- src/persona/prompt.test.ts
```
Expected: 2/2 PASS.

- [ ] **Step 5: Claude 어댑터 인터페이스**

`jieun-bot/src/claude/adapter.ts`:
```typescript
export type ClaudeCallInput = {
  systemPrompt: string;
  userPrompt: string;
  // 추후 도구는 별도 메소드로 노출
};

export type ClaudeCallResult = {
  text: string;             // 발화 텍스트 (빈 문자열이면 침묵)
  durationMs: number;
};

export interface ClaudeAdapter {
  ask(input: ClaudeCallInput): Promise<ClaudeCallResult>;
}
```

- [ ] **Step 6: Agent SDK 구현 (단순 query — 도구 없이)**

`jieun-bot/src/claude/agentSdk.ts`:
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeAdapter, ClaudeCallInput, ClaudeCallResult } from "./adapter.js";

export class AgentSdkClaude implements ClaudeAdapter {
  async ask(input: ClaudeCallInput): Promise<ClaudeCallResult> {
    const start = Date.now();
    let text = "";

    const q = query({
      prompt: input.userPrompt,
      options: {
        systemPrompt: input.systemPrompt,
        model: "sonnet",
        maxTurns: 1,             // 도구 호출 없는 단순 응답
        allowedTools: [],        // Block 1 단계: 도구 X
      },
    });

    for await (const msg of q) {
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text" && "text" in block) {
            text += (block as { text: string }).text;
          }
        }
      }
      if (msg.type === "result" && msg.subtype !== "success") {
        throw new Error(`claude error: ${msg.subtype} — ${JSON.stringify(msg).slice(0, 200)}`);
      }
    }

    return { text: text.trim(), durationMs: Date.now() - start };
  }
}
```

- [ ] **Step 7: index.ts에서 echo → Claude**

Modify `jieun-bot/src/index.ts`:
```typescript
import { bot } from "./telegram/bot.js";
import { attachReceive } from "./telegram/receive.js";
import { sendToOwner } from "./telegram/send.js";
import { Logger } from "./logger.js";
import { loadEnv } from "./env.js";
import { buildSystemPrompt } from "./persona/prompt.js";
import { AgentSdkClaude } from "./claude/agentSdk.js";
import { recentConversations } from "./db/conversations.js";

const env = loadEnv();
const logger = new Logger(env.LOG_DIR, "bot");
const claude = new AgentSdkClaude();

attachReceive(async (text, _ctx) => {
  const recent = await recentConversations(24);
  const memorySection = recent
    .slice(0, 30)
    .reverse()
    .map((c) => `${c.role === "user" ? "다영" : "이지은"}: ${c.content}`)
    .join("\n");

  const systemPrompt = buildSystemPrompt({
    trigger: "user",
    now: new Date(),
    memorySection,
    profileSection: "",          // Block 4에서 채움
    contextSection: "",          // Block 3에서 채움
  });

  try {
    const result = await claude.ask({ systemPrompt, userPrompt: text });
    if (result.text) {
      await sendToOwner(result.text, "user");
    }
    logger.info("claude responded", { durationMs: result.durationMs, hadText: !!result.text });
  } catch (err) {
    logger.error("claude failed", { err: String(err) });
    await sendToOwner("(이지은이 잠깐 막혔어. `claude login` 확인 부탁해.)", "system");
  }
});

logger.info("jieun-bot starting");
bot().start({ onStart: () => logger.info("telegram polling started") });

process.on("SIGINT", async () => {
  logger.info("SIGINT — stopping bot");
  await bot().stop();
  process.exit(0);
});
```

- [ ] **Step 8: 빌드 + 수동 검증**

```bash
cd jieun-bot && npm test && npx tsc --noEmit && npm run build
```

런처드 재로드, 다영이 텔레그램에 "안녕 이지은" → 이지은 톤의 응답.

- [ ] **Step 9: 커밋**

```bash
git add jieun-bot/src/persona/ jieun-bot/src/claude/ jieun-bot/src/index.ts
git commit -m "feat(jieun-bot): Claude Agent SDK 어댑터 + 페르소나 system prompt

@anthropic-ai/claude-agent-sdk query() 사용. Max 구독 인증 (claude login).
페르소나는 톤 5원칙 + 길이 hard limit + 호칭 룰 + 침묵 룰 + 캘린더 룰.
시간/트리거/메모리/프로파일/컨텍스트 섹션 합성.

다영의 메시지 → 최근 24h 대화 → systemPrompt → ask() → 발화.
빈 텍스트 응답이면 침묵 (저장 안 함).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.8 — 메모리 로더 (24h raw — Block 4에서 daily/weekly 추가)

**Files:**
- Create: `jieun-bot/src/memory/load.ts`
- Create: `jieun-bot/src/memory/load.test.ts`
- Modify: `jieun-bot/src/index.ts` (메모리 로더 사용)

- [ ] **Step 1: 테스트**

`jieun-bot/src/memory/load.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { formatRecentConversations } from "./load.js";

describe("formatRecentConversations", () => {
  it("renders user/bot in reverse-chronological then chronological", () => {
    const items = [
      { id: "3", role: "user" as const, content: "c", trigger: "user" as const, created_at: "2026-04-30T03:00:00Z" },
      { id: "2", role: "bot" as const, content: "b", trigger: "user" as const, created_at: "2026-04-30T02:00:00Z" },
      { id: "1", role: "user" as const, content: "a", trigger: "user" as const, created_at: "2026-04-30T01:00:00Z" },
    ];
    const out = formatRecentConversations(items);
    // 가장 오래된 것부터 (대화 흐름)
    const lines = out.split("\n");
    expect(lines[0]).toContain("다영: a");
    expect(lines[1]).toContain("이지은: b");
    expect(lines[2]).toContain("다영: c");
  });

  it("returns empty string for empty input", () => {
    expect(formatRecentConversations([])).toBe("");
  });
});
```

- [ ] **Step 2: 테스트 → FAIL → 구현**

`jieun-bot/src/memory/load.ts`:
```typescript
import { recentConversations, type Conversation } from "../db/conversations.js";

export function formatRecentConversations(items: Conversation[]): string {
  return items
    .slice()
    .reverse()
    .map((c) => {
      const speaker = c.role === "user" ? "다영" : c.role === "bot" ? "이지은" : "[system]";
      return `${speaker}: ${c.content}`;
    })
    .join("\n");
}

export async function loadMemorySection(hours: number = 24): Promise<string> {
  const items = await recentConversations(hours);
  return formatRecentConversations(items);
}
```

- [ ] **Step 3: index.ts에서 사용**

Modify `jieun-bot/src/index.ts`: `recentConversations` 직접 사용 코드를 `loadMemorySection`으로 교체.
```typescript
// import 변경
import { loadMemorySection } from "./memory/load.js";

// attachReceive 핸들러 안에서
const memorySection = await loadMemorySection(24);
```

(이전 코드의 `const recent = await recentConversations(24); const memorySection = ...` 블럭 삭제.)

- [ ] **Step 4: 테스트 + 빌드 + 커밋**

```bash
cd jieun-bot && npm test && npx tsc --noEmit
git add jieun-bot/src/memory/ jieun-bot/src/index.ts
git commit -m "feat(jieun-bot): 메모리 로더 (24h raw)

formatRecentConversations: chronological 흐름으로 user/bot 라벨링.
loadMemorySection(hours): DB 호출 + 포맷. Block 4에서 daily/weekly summary
추가 시 같은 함수 확장.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### 🟢 Block 1 체크포인트

**완료 시 다영이 검증할 것:**
1. ✅ 봇이 launchd로 항상 떠 있음 (`launchctl list | grep jieun`)
2. ✅ 텔레그램에서 "안녕 이지은" → 이지은 톤의 응답 (1~5문장)
3. ✅ 다른 chat_id로 보낸 메시지는 무시됨 (로그만 남음)
4. ✅ 봇이 어제 한 대화 (24h 안)를 기억함 ("어제 뭐 얘기했지?" 같은 질문에 응답)
5. ✅ Supabase `bot_conversations` 테이블에 모든 대화 raw 저장됨
6. ✅ logs/ 디렉토리에 mode 600 회전 로그 쌓임

**다영이 OK하면 Block 2 진행. 막히는 부분 있으면 그 Task로 돌아감.**

---

## Block 2 — 첫 동작 (Spec step 4~7)

Block 1 완료(페르소나 안정화 포함). 이제 봇이 *능동적으로 행동*하기 시작:
1. **시간 트리거 5종** — 점심·아침·퇴근직전·퇴근·회고 cron으로 자동 발화
2. **자율 데이터 기록** — 다영 발화에서 가계부 항목 추출 → 자동 INSERT
3. **`/bot-log` 페이지** — 봇이 기록한 거 7일치 보고 잘못된 거 삭제
4. **자정 이후 침묵 윈도우** — 00:00~07:59 시간 트리거 차단 (사용자 메시지는 살림)

도구 호출 방식: **Claude Agent SDK MCP 대신, 구조화 JSON 출력 후 파싱**. Claude가 자연어 응답 + `<actions>...</actions>` 블록을 같이 내고, 봇이 블록을 파싱해 DB INSERT 수행. 단순/디버그 친화/MCP 셋업 불필요.

### Task 2.1 — 트리거 라우터 공통 흐름

**Files:**
- Create: `jieun-bot/src/triggers/router.ts`
- Modify: `jieun-bot/src/index.ts` (인라인 핸들러를 router 호출로 교체)

- [ ] **Step 1: router 모듈 작성**

`jieun-bot/src/triggers/router.ts`:
```typescript
import type { Trigger } from "../db/conversations.js";
import type { ClaudeAdapter } from "../claude/adapter.js";
import { buildSystemPrompt } from "../persona/prompt.js";
import { sendToOwner } from "../telegram/send.js";
import { loadMemorySection } from "../memory/load.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

export type TriggerContext = {
  trigger: Exclude<Trigger, "system">;
  userPrompt: string;          // 트리거의 질문 / 다영 메시지 / 컨텍스트
  contextSection?: string;     // 시그널 후보 등 (Block 3에서 채움)
};

/**
 * 모든 트리거가 공유하는 흐름:
 * 1. 24h 메모리 로드
 * 2. 페르소나 시스템 프롬프트 합성
 * 3. Claude 호출
 * 4. 응답 텍스트 발신 (sendToOwner가 분리/저장 처리)
 *
 * 빈 응답이면 침묵 (발신 X). 에러면 user 트리거에 한해 폴백 메시지.
 */
export async function runTrigger(
  claude: ClaudeAdapter,
  ctx: TriggerContext
): Promise<string> {
  const memorySection = await loadMemorySection(24);
  const systemPrompt = buildSystemPrompt({
    trigger: ctx.trigger,
    now: new Date(),
    memorySection,
    profileSection: "",          // Block 4
    contextSection: ctx.contextSection ?? "",
  });

  try {
    const result = await claude.ask({ systemPrompt, userPrompt: ctx.userPrompt });
    if (result.text) {
      await sendToOwner(result.text, ctx.trigger);
    }
    logger.info("trigger ran", {
      trigger: ctx.trigger,
      durationMs: result.durationMs,
      hadText: !!result.text,
    });
    return result.text;
  } catch (err) {
    logger.error("trigger failed", { trigger: ctx.trigger, err: String(err) });
    if (ctx.trigger === "user") {
      await sendToOwner(
        "(이지은이 잠깐 막혔어. `claude login` 확인 부탁해.)",
        "system"
      );
    }
    return "";
  }
}
```

- [ ] **Step 2: index.ts에서 사용**

Modify `jieun-bot/src/index.ts` — `attachReceive` 핸들러 교체:

기존:
```typescript
attachReceive(async (text, _ctx) => {
  const memorySection = await loadMemorySection(24);
  const systemPrompt = buildSystemPrompt({...});
  try {
    const result = await claude.ask({...});
    if (result.text) await sendToOwner(result.text, "user");
    ...
  } catch (err) { ... }
});
```

새로:
```typescript
attachReceive(async (text, _ctx) => {
  await runTrigger(claude, { trigger: "user", userPrompt: text });
});
```

import 정리: `buildSystemPrompt`, `loadMemorySection`은 더 이상 직접 사용 X → import 삭제. `runTrigger` import 추가.

- [ ] **Step 3: 빌드 + 테스트**

```bash
cd jieun-bot && npm test && npx tsc --noEmit && npm run build
```
Expected: 13/13 pass, tsc silent.

- [ ] **Step 4: 커밋**

```bash
git add jieun-bot/src/triggers/router.ts jieun-bot/src/index.ts
git commit -m "$(cat <<'EOF'
feat(jieun-bot): 트리거 라우터 공통 흐름 추출

runTrigger(claude, ctx) — 모든 트리거가 공유하는 흐름:
24h 메모리 로드 → 페르소나 prompt → Claude 호출 → 응답 발신.
빈 응답이면 침묵, user 에러는 폴백 메시지.

Block 2 이후 모든 트리거(시간 cron, 이벤트, 잠재 관찰)가 이 함수 호출.
index.ts 인라인 핸들러를 router 호출로 단순화.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.2 — 점심 노크 12:30 (첫 cron)

**Files:**
- Create: `jieun-bot/src/triggers/schedule.ts`
- Modify: `jieun-bot/src/index.ts` (attachSchedule 호출)

- [ ] **Step 1: schedule.ts 작성** (점심 노크만 우선)

`jieun-bot/src/triggers/schedule.ts`:
```typescript
import cron from "node-cron";
import { runTrigger } from "./router.js";
import type { ClaudeAdapter } from "../claude/adapter.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

export function attachSchedule(claude: ClaudeAdapter): void {
  // 점심 12:30 KST — 끼니 챙김 가벼운 노크
  cron.schedule(
    "30 12 * * *",
    () => {
      runTrigger(claude, {
        trigger: "schedule",
        userPrompt:
          "지금은 점심 12:30. 다영이 끼니를 잘 못 챙긴다는 점을 알고 있지. " +
          "점심 챙겼는지 가볍게 물어보고 싶으면 한마디. " +
          "답이 없을 수도 있다는 점 알고 있으니 부담 없이. 침묵해도 OK.",
      }).catch((err) => logger.error("lunch knock failed", { err: String(err) }));
    },
    { timezone: "Asia/Seoul" }
  );

  logger.info("schedule attached", { tasks: ["lunch:12:30"] });
}
```

- [ ] **Step 2: index.ts에서 호출** — `bot().start({...}).catch(...)` 직전에 한 줄:

```typescript
import { attachSchedule } from "./triggers/schedule.js";

// 기존 attachReceive(...) 호출 다음에 추가:
attachSchedule(claude);
```

- [ ] **Step 3: 빌드 + 테스트**

```bash
cd jieun-bot && npm test && npx tsc --noEmit && npm run build
```
Expected: 13/13 pass.

`node-cron` 자체 테스트는 추가하지 않음 — `cron.schedule(...)` 호출은 라이브러리 책임. `runTrigger` 로직은 Task 2.1에서 이미 검증.

- [ ] **Step 4: 커밋**

```bash
git add jieun-bot/src/triggers/schedule.ts jieun-bot/src/index.ts
git commit -m "$(cat <<'EOF'
feat(jieun-bot): 점심 노크 12:30 (첫 cron)

node-cron으로 매일 12:30 KST에 runTrigger(schedule). 다영의 끼니 챙김
패턴을 prompt에 명시. 침묵 OK, 답 없으면 그냥 넘어가도록.

Block 2의 나머지 4개 트리거(아침/퇴근직전/퇴근/회고)는 Task 2.7에서 추가.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.3 — Action 타입 + parser

**Files:**
- Create: `jieun-bot/src/claude/actions.ts`
- Create: `jieun-bot/src/claude/actions.test.ts`
- Modify: `jieun-bot/src/persona/prompt.ts` ([자율 기록] 섹션 추가)

- [ ] **Step 1: 테스트 작성 (TDD)**

`jieun-bot/src/claude/actions.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parseActions } from "./actions.js";

describe("parseActions", () => {
  it("returns clean text and parsed actions when block present", () => {
    const input = `김밥 잘 먹었네!\n<actions>\n[{"kind":"budget_insert","amount":7000,"category":"식비","memo":"김밥","type":"expense","date_offset":0}]\n</actions>`;
    const r = parseActions(input);
    expect(r.cleanText).toBe("김밥 잘 먹었네!");
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]).toMatchObject({
      kind: "budget_insert",
      amount: 7000,
      category: "식비",
      memo: "김밥",
      type: "expense",
    });
  });

  it("returns empty actions when no block", () => {
    const r = parseActions("그냥 평범한 답변이야.");
    expect(r.cleanText).toBe("그냥 평범한 답변이야.");
    expect(r.actions).toEqual([]);
  });

  it("skips invalid items but keeps valid ones", () => {
    const input = `text\n<actions>\n[{"kind":"unknown"},{"kind":"budget_insert","amount":7000,"category":"식비","memo":"x","type":"expense","date_offset":0}]\n</actions>`;
    const r = parseActions(input);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]?.kind).toBe("budget_insert");
  });

  it("returns parseError on malformed JSON", () => {
    const r = parseActions(`text\n<actions>\nnot json\n</actions>`);
    expect(r.parseError).toBeDefined();
    expect(r.cleanText).toBe("text");
    expect(r.actions).toEqual([]);
  });

  it("preserves multiline cleanText", () => {
    const input = `첫 단락.\n\n둘째 단락.\n<actions>\n[]\n</actions>`;
    const r = parseActions(input);
    expect(r.cleanText).toContain("첫 단락");
    expect(r.cleanText).toContain("둘째 단락");
  });
});
```

- [ ] **Step 2: 테스트 실행 → FAIL**

```bash
cd jieun-bot && npm test -- src/claude/actions.test.ts
```

- [ ] **Step 3: 구현**

`jieun-bot/src/claude/actions.ts`:
```typescript
import { z } from "zod";

const BudgetInsertSchema = z.object({
  kind: z.literal("budget_insert"),
  amount: z.number().int().positive(),
  category: z.string().min(1),
  memo: z.string().min(1),
  type: z.enum(["income", "expense", "saving"]),
  date_offset: z.number().int().min(-7).max(0).default(0),
});

export const ActionSchema = z.discriminatedUnion("kind", [BudgetInsertSchema]);
export type Action = z.infer<typeof ActionSchema>;

const ACTIONS_BLOCK_RE = /<actions>\s*([\s\S]*?)\s*<\/actions>/;

export type ParseResult = {
  cleanText: string;       // <actions> 블록 제거된 자연어
  actions: Action[];
  parseError?: string;     // JSON/스키마 실패 시
};

export function parseActions(claudeText: string): ParseResult {
  const match = claudeText.match(ACTIONS_BLOCK_RE);
  if (!match) {
    return { cleanText: claudeText.trim(), actions: [] };
  }

  const cleanText = claudeText.replace(ACTIONS_BLOCK_RE, "").trim();
  const jsonStr = match[1] ?? "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return { cleanText, actions: [], parseError: `JSON parse: ${String(err)}` };
  }

  if (!Array.isArray(parsed)) {
    return { cleanText, actions: [], parseError: "actions must be an array" };
  }

  const actions: Action[] = [];
  for (const item of parsed) {
    const r = ActionSchema.safeParse(item);
    if (r.success) actions.push(r.data);
    // 잘못된 item은 조용히 건너뜀 (one bad apple ≠ all)
  }
  return { cleanText, actions };
}
```

- [ ] **Step 4: 페르소나 prompt에 [자율 기록] 섹션 추가**

`jieun-bot/src/persona/prompt.ts`의 CORE 안에 — `[캘린더 등록]` 섹션 *바로 위*에:

```
[자율 기록 — 데이터 INSERT]
다영 발화에서 *기록할 만한 게 있으면* 자연어 답변 뒤에 <actions>...</actions> JSON 블록을 덧붙여라. 이건 다영 화면에 안 보이고 시스템이 처리한다.

형식:
<actions>
[
  {"kind":"budget_insert","amount":7000,"category":"식비","memo":"김밥","type":"expense","date_offset":0}
]
</actions>

지원 액션 (Block 2):
- budget_insert: amount(원, 정수), category(가계부 카테고리 — 모르면 "미분류"),
  memo(짧은 설명/가게명), type("income"/"expense"/"saving"),
  date_offset(0=오늘, -1=어제, -2=그제 — 기본 0)

기록할 게 없으면 <actions> 자체를 생략. 자연어 답변만 보내라.
다영이 명확히 금액 + 종류 언급한 경우만 기록 (애매하면 X).
```

- [ ] **Step 5: 재테스트 + 빌드**

```bash
cd jieun-bot && npm test && npx tsc --noEmit && npm run build
```
Expected: 18/18 pass (기존 13 + 새 5).

- [ ] **Step 6: 커밋**

```bash
git add jieun-bot/src/claude/actions.ts jieun-bot/src/claude/actions.test.ts jieun-bot/src/persona/prompt.ts
git commit -m "$(cat <<'EOF'
feat(jieun-bot): Action 파서 + [자율 기록] 페르소나 룰

Claude가 자연어 응답 + <actions>JSON</actions> 블록을 같이 출력하도록
페르소나 prompt에 명시. 봇은 <actions> 블록을 파싱해 budget_insert 등
실행. <actions> 없으면 자연어만 발신.

actions.ts: zod discriminated union으로 budget_insert 스키마.
parseActions(claudeText): {cleanText, actions, parseError}.
잘못된 item은 조용히 건너뜀 — 한 액션 실패가 응답을 막지 않음.

Block 2의 다음 task(executor)에서 actions 실행 + bot_writes 추적.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.4 — Action executor + bot_writes 기록 + router 와이어

**Files:**
- Create: `jieun-bot/src/db/botWrites.ts`
- Create: `jieun-bot/src/db/botWrites.test.ts`
- Create: `jieun-bot/src/claude/executeActions.ts`
- Modify: `jieun-bot/src/triggers/router.ts` (parser + executor 와이어)

- [ ] **Step 1: bot_writes CRUD 테스트 (통합)**

`jieun-bot/src/db/botWrites.test.ts`:
```typescript
import { describe, it, expect, afterAll } from "vitest";
import { db } from "./client.js";
import { recordBotWrite, recentBotWrites, markBotWriteEdited } from "./botWrites.js";

const TEST_NOTE = "__test_botwrites_";

describe("botWrites", () => {
  afterAll(async () => {
    await db().from("bot_writes").delete().like("notes", `${TEST_NOTE}%`);
  });

  it("records and reads recent", async () => {
    const id = await recordBotWrite({
      targetTable: "budget_entries",
      targetId: "00000000-0000-0000-0000-000000000001",
      notes: `${TEST_NOTE}hello`,
    });
    expect(id).toMatch(/^[0-9a-f-]+$/);
    const recent = await recentBotWrites(1);
    const own = recent.filter((w) => w.notes?.startsWith(TEST_NOTE));
    expect(own.length).toBeGreaterThanOrEqual(1);
  });

  it("marks edited", async () => {
    const id = await recordBotWrite({
      targetTable: "budget_entries",
      targetId: "00000000-0000-0000-0000-000000000002",
      notes: `${TEST_NOTE}edit`,
    });
    await markBotWriteEdited(id);
    const recent = await recentBotWrites(1);
    const found = recent.find((w) => w.id === id);
    expect(found?.user_edited_at).not.toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 → FAIL → 구현**

`jieun-bot/src/db/botWrites.ts`:
```typescript
import { db } from "./client.js";

export type BotWrite = {
  id: string;
  target_table: string;
  target_id: string;
  conversation_id: string | null;
  written_at: string;
  user_edited_at: string | null;
  notes: string | null;
};

export async function recordBotWrite(args: {
  targetTable: string;
  targetId: string;
  conversationId?: string | null;
  notes?: string;
}): Promise<string> {
  const { data, error } = await db()
    .from("bot_writes")
    .insert({
      target_table: args.targetTable,
      target_id: args.targetId,
      conversation_id: args.conversationId ?? null,
      notes: args.notes ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function recentBotWrites(days: number = 7): Promise<BotWrite[]> {
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const { data, error } = await db()
    .from("bot_writes")
    .select("id, target_table, target_id, conversation_id, written_at, user_edited_at, notes")
    .gte("written_at", since)
    .order("written_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as BotWrite[];
}

export async function markBotWriteEdited(id: string): Promise<void> {
  const { error } = await db()
    .from("bot_writes")
    .update({ user_edited_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 3: Action executor 작성**

`jieun-bot/src/claude/executeActions.ts`:
```typescript
import { db } from "../db/client.js";
import { recordBotWrite } from "../db/botWrites.js";
import type { Action } from "./actions.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

function dateForOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Run the actions emitted by Claude. One failure does not abort others.
 * Each successful insert is logged to bot_writes for sufficient audit + sufficient
 * sourcing in /bot-log so 다영 can review and undo.
 */
export async function executeActions(actions: Action[]): Promise<void> {
  for (const a of actions) {
    try {
      if (a.kind === "budget_insert") {
        const date = dateForOffset(a.date_offset);
        const { data, error } = await db()
          .from("budget_entries")
          .insert({
            date,
            category: a.category,
            memo: a.memo,
            amount: a.amount,
            type: a.type,
          })
          .select("id")
          .single();
        if (error) throw error;
        await recordBotWrite({
          targetTable: "budget_entries",
          targetId: data.id,
          notes: `${a.memo} ${a.amount.toLocaleString()}원 (${a.category}, ${a.type}, ${date})`,
        });
        logger.info("action: budget_insert", { id: data.id, amount: a.amount, category: a.category });
      }
    } catch (err) {
      logger.error("action failed", { kind: a.kind, err: String(err) });
      // 한 액션 실패가 응답 흐름을 막지 않게 swallow
    }
  }
}
```

- [ ] **Step 4: router.ts에 parser + executor 와이어**

Modify `jieun-bot/src/triggers/router.ts`:

```typescript
// 추가 imports
import { parseActions } from "../claude/actions.js";
import { executeActions } from "../claude/executeActions.js";

// runTrigger 안 — claude.ask 결과 처리 부분을 다음으로 교체:
const result = await claude.ask({ systemPrompt, userPrompt: ctx.userPrompt });
const { cleanText, actions, parseError } = parseActions(result.text);
if (parseError) {
  logger.warn("actions parse error", { trigger: ctx.trigger, parseError });
}
if (cleanText) {
  await sendToOwner(cleanText, ctx.trigger);
}
if (actions.length > 0) {
  await executeActions(actions);
  logger.info("actions executed", { trigger: ctx.trigger, count: actions.length });
}
logger.info("trigger ran", {
  trigger: ctx.trigger,
  durationMs: result.durationMs,
  hadText: !!cleanText,
  actionCount: actions.length,
});
return cleanText;
```

(기존 return result.text → return cleanText로 변경)

- [ ] **Step 5: 테스트 + 빌드**

```bash
cd jieun-bot && npm test && npx tsc --noEmit && npm run build
```
Expected: 20/20 pass (기존 18 + 새 2 botWrites).

- [ ] **Step 6: 커밋**

```bash
git add jieun-bot/src/db/botWrites.ts jieun-bot/src/db/botWrites.test.ts \
        jieun-bot/src/claude/executeActions.ts jieun-bot/src/triggers/router.ts
git commit -m "$(cat <<'EOF'
feat(jieun-bot): Action executor + bot_writes 기록 + router 와이어

router.runTrigger:
1. Claude 호출 → parseActions로 자연어 + actions 분리
2. 자연어는 sendToOwner (분리/저장 처리)
3. actions는 executeActions로 실행 — 각 INSERT는 bot_writes에 기록

executeActions: 현재 budget_insert만 지원. date_offset(0=오늘,-1=어제..)
적용 → budget_entries INSERT → bot_writes에 사람-읽기용 notes 저장.
한 액션 실패가 다음 액션을 막지 않게 swallow.

botWrites.ts: record/recent/markEdited CRUD. 통합 테스트로 검증.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.5 — Next.js `/bot-log` 페이지

**Files:**
- Create: `src/lib/botLog/recent.ts`
- Create: `src/app/(main)/bot-log/page.tsx`
- Create: `src/app/(main)/bot-log/BotLogList.tsx`

- [ ] **Step 1: server-side 데이터 fetcher**

`src/lib/botLog/recent.ts`:
```typescript
import { createClient } from "@/lib/supabase/server";

export type BudgetTarget = {
  kind: "budget_entries";
  id: string;
  date: string;
  category: string;
  memo: string;
  amount: number;
  type: string;
};

export type UnknownTarget = { kind: "unknown" };

export type BotLogEntry = {
  id: string;
  written_at: string;
  user_edited_at: string | null;
  notes: string | null;
  targetTable: string;
  targetId: string;
  target: BudgetTarget | UnknownTarget;
};

export async function getRecentBotLog(days: number = 7): Promise<BotLogEntry[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const { data: writes, error } = await supabase
    .from("bot_writes")
    .select("id, target_table, target_id, written_at, user_edited_at, notes")
    .gte("written_at", since)
    .order("written_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!writes) return [];

  // budget_entries 일괄 fetch (다른 테이블은 Block 4에서 추가)
  const budgetIds = writes
    .filter((w) => w.target_table === "budget_entries")
    .map((w) => w.target_id);

  const targets = new Map<string, BudgetTarget>();
  if (budgetIds.length > 0) {
    const { data: rows } = await supabase
      .from("budget_entries")
      .select("id, date, category, memo, amount, type")
      .in("id", budgetIds);
    for (const r of rows ?? []) {
      targets.set(r.id, { kind: "budget_entries", ...r } as BudgetTarget);
    }
  }

  return writes.map((w) => ({
    id: w.id,
    written_at: w.written_at,
    user_edited_at: w.user_edited_at,
    notes: w.notes,
    targetTable: w.target_table,
    targetId: w.target_id,
    target:
      w.target_table === "budget_entries" && targets.has(w.target_id)
        ? targets.get(w.target_id)!
        : ({ kind: "unknown" } as UnknownTarget),
  }));
}
```

- [ ] **Step 2: 페이지 (Server Component)**

`src/app/(main)/bot-log/page.tsx`:
```tsx
import { getRecentBotLog } from "@/lib/botLog/recent";
import { BotLogList } from "./BotLogList";

export const dynamic = "force-dynamic";

export default async function BotLogPage() {
  const entries = await getRecentBotLog(7);
  return (
    <div className="pb-24">
      <div className="bg-surface px-4 pt-5 pb-3 border-b border-hair-light">
        <h1 className="text-[18px] font-extrabold tracking-tight">이지은이 기록한 것</h1>
        <p className="text-[12px] text-ink-sub mt-1">최근 7일 · {entries.length}건</p>
      </div>
      <BotLogList entries={entries} />
    </div>
  );
}
```

- [ ] **Step 3: 리스트 컴포넌트**

`src/app/(main)/bot-log/BotLogList.tsx`:
```tsx
"use client";

import type { BotLogEntry } from "@/lib/botLog/recent";
import { deleteBotWriteAction } from "./actions";

export function BotLogList({ entries }: { entries: BotLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-ink-sub text-[13px]">
        아직 봇이 기록한 게 없어요.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-hair-light">
      {entries.map((e) => (
        <li key={e.id} className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            {e.target.kind === "budget_entries" ? (
              <>
                <div className="text-[13px] truncate">
                  {e.target.date} · {e.target.category} · {e.target.memo}
                </div>
                <div className="text-[12px] text-ink-sub">
                  {e.target.amount.toLocaleString()}원 · {e.target.type}
                </div>
              </>
            ) : (
              <div className="text-[13px] text-ink-sub">
                {e.targetTable} (대상 못 찾음)
              </div>
            )}
            <div className="text-[10px] text-ink-sub mt-1">
              {new Date(e.written_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
              {e.user_edited_at && " · 수정됨"}
            </div>
          </div>
          <form action={deleteBotWriteAction.bind(null, e.id)}>
            <button
              type="submit"
              className="text-[12px] text-rose-500 px-3 py-1 rounded-input border border-hair-light"
            >
              삭제
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: 빌드 + 시각 확인**

Server-side 페이지라 `npm run build` 또는 `npm run dev`로 컴파일 확인. 본 task는 행동 검증을 다음 task의 server action에 의존 → 일단 빌드 OK면 진행.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/botLog/ src/app/\(main\)/bot-log/page.tsx src/app/\(main\)/bot-log/BotLogList.tsx
git commit -m "$(cat <<'EOF'
feat(app): /bot-log 페이지 — 봇 자율 기록 7일치 열람

Server Component로 bot_writes 최근 100건 조회 후 budget_entries 일괄 join.
target row가 없으면 'unknown' 표시.

BotLogList: 날짜/카테고리/메모/금액/타입/시각 + 수정됨 표시. 우측에
삭제 버튼 (Server Action — Task 2.6에서 추가).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.6 — `/bot-log` 삭제 Server Action

**Files:**
- Create: `src/app/(main)/bot-log/actions.ts`

- [ ] **Step 1: Server Action**

`src/app/(main)/bot-log/actions.ts`:
```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Delete a bot-recorded entry. Removes the target row from its source table
 * AND marks the bot_writes row as user_edited_at (audit trail preserved —
 * 다영이 수정한 사실은 남기고, 데이터만 삭제).
 *
 * Note: 본 Server Action은 user-authenticated가 동작 — `authenticated` RLS
 * 정책이 SELECT만 허용하므로 DELETE/UPDATE는 service_role 필요.
 * v1 단일 사용자 기준으로 RLS bypass 위해 supabase server client는
 * service_role 사용 (`@/lib/supabase/server`). 이미 그렇게 셋업됨.
 */
export async function deleteBotWriteAction(id: string): Promise<void> {
  const supabase = await createClient();

  const { data: write, error: getErr } = await supabase
    .from("bot_writes")
    .select("target_table, target_id")
    .eq("id", id)
    .single();
  if (getErr) throw getErr;
  if (!write) return;

  // 1. 대상 row 삭제
  const { error: tErr } = await supabase
    .from(write.target_table)
    .delete()
    .eq("id", write.target_id);
  if (tErr) throw tErr;

  // 2. bot_writes row를 'edited' 표시 (audit 보존)
  const { error: bErr } = await supabase
    .from("bot_writes")
    .update({ user_edited_at: new Date().toISOString() })
    .eq("id", id);
  if (bErr) throw bErr;

  revalidatePath("/bot-log");
}
```

- [ ] **Step 2: RLS 확인 — 클라이언트의 supabase는 어떤 키 쓰는지**

`src/lib/supabase/server.ts`를 확인 (Block 1 이전 파일). 만약 anon 키 사용이면, Server Action에서 service_role 필요한 DELETE/UPDATE가 막힘. 이 경우 별도 service_role 클라이언트를 새로 만들어야 함.

기존 코드 확인:
```bash
cat src/lib/supabase/server.ts
```

- 만약 `NEXT_PUBLIC_SUPABASE_ANON_KEY`만 사용 중 → Server Action용 `createServiceClient()` 헬퍼 추가:

`src/lib/supabase/serviceServer.ts` (필요 시 작성):
```typescript
import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
```

그리고 actions.ts에서 createClient 대신 createServiceClient 사용.

(기존 server.ts가 이미 service_role이면 이 단계 skip — 같은 createClient 그대로 사용.)

- [ ] **Step 3: 빌드**

```bash
cd /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73 && npm run build 2>&1 | tail -15
```

Expected: build success. Server Action이 등록되는지 확인.

- [ ] **Step 4: 수동 검증** (페르소나가 budget 기록 한 번 한 후):
- 봇이랑 "오늘 김밥 7천원 먹었어" 같은 대화
- 텔레그램에 "기록해뒀어" 류 답변 + 자율 INSERT 발생 확인 (Supabase에서 budget_entries SELECT, bot_writes SELECT)
- 다영이 앱 `/bot-log` 열어 그 row 보임 + 삭제 버튼으로 삭제 → budget_entries에서도 사라짐, bot_writes는 user_edited_at 마킹됨

(이 검증은 Task 2.4까지 완료 + 봇 reload 후 가능. Task 2.6 자체는 server action만 작성 + 빌드 OK까지.)

- [ ] **Step 5: 커밋**

```bash
git add src/app/\(main\)/bot-log/actions.ts
# (만약 createServiceClient 추가했다면 그 파일도)
git commit -m "$(cat <<'EOF'
feat(app): /bot-log 삭제 Server Action

deleteBotWriteAction(id):
1. bot_writes에서 target_table/target_id 조회
2. 대상 테이블의 row DELETE (예: budget_entries)
3. bot_writes는 row 유지하되 user_edited_at 마킹 (audit 보존)
4. revalidatePath("/bot-log")로 리스트 갱신

다영이 봇의 잘못 기록을 직접 청소할 수 있는 길.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.7 — 시간 트리거 4개 추가 (08:00 / 20:30 / 21:00 / 23:00)

**Files:**
- Modify: `jieun-bot/src/triggers/schedule.ts` (4개 cron 추가)

- [ ] **Step 1: schedule.ts에 cron 4개 더**

기존 `attachSchedule(claude)` 함수 안에, 점심 cron *밑에* 추가:

```typescript
  // 아침 08:00 KST — 가벼운 인사 / 어제 환기
  cron.schedule(
    "0 8 * * *",
    () => {
      runTrigger(claude, {
        trigger: "schedule",
        userPrompt:
          "지금은 아침 08:00. 다영의 하루 시작 전. " +
          "어제 못 한 거 가볍게 환기하거나 좋은 아침 인사. " +
          "캘린더 데이터는 Block 3에서 추가될 예정 — 지금은 일정 언급 X. " +
          "짧게 한두 문장. 침묵해도 OK.",
      }).catch((err) => logger.error("morning brief failed", { err: String(err) }));
    },
    { timezone: "Asia/Seoul" }
  );

  // 퇴근 직전 20:30 KST — 내일 챙길 거 (Block 3 캘린더 연동 전엔 가벼운 안부)
  cron.schedule(
    "30 20 * * *",
    () => {
      runTrigger(claude, {
        trigger: "schedule",
        userPrompt:
          "지금은 20:30. 다영의 퇴근 직전. " +
          "캘린더 데이터는 Block 3에서 추가 — 지금은 가벼운 안부. " +
          "침묵 OK.",
      }).catch((err) => logger.error("evening brief failed", { err: String(err) }));
    },
    { timezone: "Asia/Seoul" }
  );

  // 퇴근 시간 21:00 KST — 퇴근 체크
  cron.schedule(
    "0 21 * * *",
    () => {
      runTrigger(claude, {
        trigger: "schedule",
        userPrompt:
          "지금은 21:00. 다영의 퇴근 시간 즈음. " +
          "'오늘 길었지, 퇴근했어?' 정도 가볍게. 답 없으면 그냥 넘어감. 침묵 OK.",
      }).catch((err) => logger.error("end_of_day check failed", { err: String(err) }));
    },
    { timezone: "Asia/Seoul" }
  );

  // 회고 23:00 KST — 테이블 앞 인사 (회고 본격 모드는 Block 4)
  cron.schedule(
    "0 23 * * *",
    () => {
      runTrigger(claude, {
        trigger: "schedule",
        userPrompt:
          "지금은 23:00. 다영이 집에 와서 테이블 앞에 앉을 시간. " +
          "가볍게 '테이블 앞이야?' 같은 노크. " +
          "다영이 응하면 본격 회고 (Block 4에서 회고 모드 본격 도입 — 지금은 시작 인사만). " +
          "침묵 OK.",
      }).catch((err) => logger.error("evening retro failed", { err: String(err) }));
    },
    { timezone: "Asia/Seoul" }
  );
```

그리고 `logger.info("schedule attached", ...)`의 tasks 배열을 업데이트:
```typescript
  logger.info("schedule attached", {
    tasks: ["morning:08", "lunch:12:30", "evening_brief:20:30", "end_of_day:21", "retro:23"],
  });
```

- [ ] **Step 2: 빌드 + 테스트**

```bash
cd jieun-bot && npm test && npx tsc --noEmit && npm run build
```
Expected: 20/20 pass.

- [ ] **Step 3: 커밋**

```bash
git add jieun-bot/src/triggers/schedule.ts
git commit -m "$(cat <<'EOF'
feat(jieun-bot): 시간 트리거 4개 추가 — 하루 5회 발화 후보

기존 점심 12:30 + 추가 4개:
- 08:00 아침 인사 / 어제 환기
- 20:30 내일 챙길 거 (캘린더 연동은 Block 3)
- 21:00 퇴근 체크
- 23:00 회고 시작 인사 (회고 본격 모드는 Block 4)

각 cron은 trigger=schedule으로 runTrigger 호출. 페르소나의 침묵 룰 + 도배
방지 룰이 알아서 침묵/발화 판단.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.8 — 자정 이후 하드 침묵 윈도우

**Files:**
- Create: `jieun-bot/src/triggers/silenceWindow.ts`
- Create: `jieun-bot/src/triggers/silenceWindow.test.ts`
- Modify: `jieun-bot/src/triggers/router.ts`

- [ ] **Step 1: 테스트 (TDD)**

`jieun-bot/src/triggers/silenceWindow.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { isInSilenceWindow } from "./silenceWindow.js";

describe("isInSilenceWindow", () => {
  it("returns true at midnight KST (15:00 UTC)", () => {
    const d = new Date("2026-04-30T15:00:00Z");
    expect(isInSilenceWindow(d)).toBe(true);
  });

  it("returns true at 03:00 KST (18:00 UTC prev day)", () => {
    const d = new Date("2026-04-29T18:00:00Z");
    expect(isInSilenceWindow(d)).toBe(true);
  });

  it("returns true at 07:59 KST (22:59 UTC prev day)", () => {
    const d = new Date("2026-04-29T22:59:00Z");
    expect(isInSilenceWindow(d)).toBe(true);
  });

  it("returns false at 08:00 KST (23:00 UTC prev day)", () => {
    const d = new Date("2026-04-29T23:00:00Z");
    expect(isInSilenceWindow(d)).toBe(false);
  });

  it("returns false at 12:30 KST (03:30 UTC same day)", () => {
    const d = new Date("2026-04-30T03:30:00Z");
    expect(isInSilenceWindow(d)).toBe(false);
  });

  it("returns false at 23:00 KST (14:00 UTC same day)", () => {
    const d = new Date("2026-04-30T14:00:00Z");
    expect(isInSilenceWindow(d)).toBe(false);
  });
});
```

- [ ] **Step 2: 구현**

`jieun-bot/src/triggers/silenceWindow.ts`:
```typescript
/**
 * 자정~07:59 KST 하드 침묵 윈도우.
 * 시간 트리거 + 잠재 관찰 + 이벤트 트리거에 적용.
 * 사용자 메시지(user 트리거)는 항상 살아있음 — 다영이 새벽에 보내면 답함.
 */
export function isInSilenceWindow(now: Date = new Date()): boolean {
  // KST 시각의 시(hour) 추출
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hour12: false,
  });
  const hourStr = formatter.format(now);  // "00".."23"
  const hour = parseInt(hourStr, 10);
  return hour < 8;
}
```

- [ ] **Step 3: router.ts에 가드 추가**

Modify `runTrigger` 시작부 — 메모리 로드 *전에*:

```typescript
import { isInSilenceWindow } from "./silenceWindow.js";

export async function runTrigger(
  claude: ClaudeAdapter,
  ctx: TriggerContext
): Promise<string> {
  // user 트리거는 항상 살림 (다영이 새벽에 메시지 보내면 응답)
  // schedule/event/latent는 자정~07:59 차단
  if (ctx.trigger !== "user" && isInSilenceWindow()) {
    logger.info("silenced (window)", { trigger: ctx.trigger });
    return "";
  }

  // 기존 흐름 그대로
  const memorySection = await loadMemorySection(24);
  ...
}
```

- [ ] **Step 4: 테스트 + 빌드**

```bash
cd jieun-bot && npm test && npx tsc --noEmit && npm run build
```
Expected: 26/26 pass (기존 20 + 새 6).

- [ ] **Step 5: 커밋**

```bash
git add jieun-bot/src/triggers/silenceWindow.ts jieun-bot/src/triggers/silenceWindow.test.ts jieun-bot/src/triggers/router.ts
git commit -m "$(cat <<'EOF'
feat(jieun-bot): 자정~07:59 하드 침묵 윈도우

isInSilenceWindow(): KST 기준 시(hour) < 8 이면 true.
router.runTrigger 시작부에서 user 외 트리거는 차단 (return "").

다영이 새벽에 메시지 보내면 응답함 (user 트리거는 항상 살림). 시간 cron,
이벤트, 잠재 관찰만 침묵.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### 🟢 Block 2 체크포인트

**다영이 검증할 항목:**

1. ✅ 봇 reload 후 텔레그램에 "오늘 김밥 7천원 먹었어" 같은 메시지
2. ✅ 봇이 자연어로 답하면서 가계부에도 자동 INSERT (Supabase에서 `SELECT * FROM budget_entries ORDER BY created_at DESC LIMIT 5;` 확인)
3. ✅ 앱에서 `/bot-log` 열면 그 기록이 7일치 리스트에 보임 + 삭제 버튼
4. ✅ 삭제하면 budget_entries에서도 사라짐 + bot_writes의 user_edited_at 마킹
5. ✅ 12:30이 되면 봇이 자발적으로 "점심 챙겼어?" 같은 노크 (또는 침묵)
6. ✅ 23:00이 되면 "테이블 앞이야?" 같은 노크
7. ✅ 새벽 02:00에 cron 트리거가 동작 안 함 (로그에 "silenced (window)")
8. ✅ 새벽 02:00에 다영이 메시지 보내면 응답함 (user 트리거는 살아있음)

**Block 3 가기 전에 다영이 며칠 운영해보고 페르소나 추가 보정 가능.**

---

## Block 3 — 외부 연결 (Spec step 8~10)

### Task 3.1 — Supabase Realtime — budget_entries INSERT 구독
### Task 3.2 — 시그널: 카테고리 이상치
### Task 3.3 — 시그널: 예산 페이스
### Task 3.4 — 시그널: 루틴 streak/break
### Task 3.5 — 시그널: 회피→실행 전환
### Task 3.6 — 시그널: 메모 빈도 변화
### Task 3.7 — 시그널 도배 방지 (24h dedup)
### Task 3.8 — 이벤트 트리거 통합 흐름
### Task 3.9 — icalBuddy 캘린더 읽기
### Task 3.10 — 아침/퇴근직전 브리핑에 캘린더 주입
### Task 3.11 — AppleScript 등록/삭제 + osascript 래퍼
### Task 3.12 — write_calendar / delete_calendar 도구
### Task 3.13 — 자연어 → 구조화 → 확인 → 등록 상태머신
### Task 3.14 — 캘린더 등록 → bot_writes 추적

### 🟢 Block 3 체크포인트
외식 평소보다 많을 때 봇이 한마디. 다영이 "내일 3시 ABC" → 구조화 확인 → 캘린더 등록.

---

## Block 4 — 깊이 (Spec step 11~14)

### Task 4.1 — 6시간 잠재 관찰 cron
### Task 4.2 — 잠재 관찰 system prompt + 발화/침묵 자체 판단
### Task 4.3 — 회고 대화 모드 (23:00 — 좋았던 점/아쉬운 점/내일 한 가지)
### Task 4.4 — daily_summary 생성 잡 (23:30)
### Task 4.5 — daily_summary가 메모리 로더에 들어감 (30일치)
### Task 4.6 — weekly_summary 생성 잡 (일요일 23:59)
### Task 4.7 — 30일 이전 weekly_summary 메모리 로더 통합
### Task 4.8 — user_profile 누적 (kind 3종 — pattern/preference/tone)
### Task 4.9 — user_profile 통합/갱신 (superseded_by)
### Task 4.10 — user_profile system prompt 주입 (profileSection)
### Task 4.11 — Next.js `/profile-log` 페이지 + 라인 삭제
### Task 4.12 — 수동 mute (텔레그램 "조용히" / "취소")
### Task 4.13 — 자동 backoff (연속 발화 3회)
### Task 4.14 — 운영 매뉴얼 보강 (jieun-runbook.md 최종)

### 🟢 Block 4 체크포인트 (= v1 완료)
4주차쯤부터 user_profile에 라인 누적 → 봇 톤이 *옆에 있는 사람*에 가까워짐. 잠재 관찰 침묵률 70%+. 회고 대화 30%+ 진행률.

---

## 결정 / 미해결 사항 정리

본 plan에서 결정한 spec 미해결 사항:
- **launchd vs node-cron**: launchd는 KeepAlive 단일 등록 (Task 1.6), 시간 트리거는 node-cron으로 봇 프로세스 안에서 (Block 2). 단순 + 빠른 디버깅.
- **Supabase Realtime vs Polling**: Realtime 구독으로 가되 (Task 3.1) 실패 시 폴링 폴백 둠 (Task 3.1에 구현).

남은 미해결 (Block 진행하며 결정):
- AppleScript Calendar TCC 권한 부여 절차 — Task 3.11 첫 실행 시 검증.
- Claude Max 한도 모니터링 — Task 4.14 운영 매뉴얼에 카운터 임계 + 알림 룰 추가.
- 한국어 자연어 → 캘린더 파싱 정확도 — Task 3.13 운영 후 패턴 보강.
