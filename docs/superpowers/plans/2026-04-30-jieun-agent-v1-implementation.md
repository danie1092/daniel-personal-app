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

Block 1+2 완료 — 봇이 시간 트리거로 능동 발화하고, 자연어에서 데이터 자동 기록함. Block 3는 두 가지 외부 연결:

**3a (Task 3.1~3.8) — 이벤트 트리거 + 시그널 5종**: Supabase Realtime으로 budget_entries INSERT를 구독, 각 INSERT마다 5개 시그널 (예산 페이스, 카테고리 이상치, 루틴 streak/break, 회피→실행 전환, 메모 빈도) 계산, 후보를 `bot_signals`에 저장하고 24h 도배 방지 dedup 통과한 것만 Claude에 컨텍스트로 던져 발화/침묵 판단.

**3b (Task 3.9~3.14) — 캘린더 read/write**: icalBuddy로 Apple Calendar 일정 읽기 (아침/퇴근직전 브리핑에 주입), AppleScript로 등록/삭제, 자연어 → 구조화 확인 흐름.

3a 구현 + 검증 후 3b plan을 detail해서 진행.

---

### Task 3.1 — Supabase Realtime + event 트리거 골격

**Files:**
- Create: `jieun-bot/src/triggers/event.ts`
- Modify: `jieun-bot/src/index.ts` (attachEvents 호출)

이 task는 Realtime 구독 wiring만 — 실제 시그널 계산 로직은 다음 task에서. 핸들러는 일단 로그만 찍는 stub.

- [ ] **Step 1: event.ts 골격**

```typescript
// src/triggers/event.ts
import type { ClaudeAdapter } from "../claude/adapter.js";
import { db } from "../db/client.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

export function attachEvents(_claude: ClaudeAdapter): void {
  const channel = db()
    .channel("budget_entries_changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "budget_entries" },
      (payload) => {
        // payload.new는 새 row
        const row = payload.new as { id: string; date: string; category: string; amount: number; type: string };
        logger.info("event: budget_entries INSERT", {
          id: row.id,
          date: row.date,
          category: row.category,
          amount: row.amount,
        });
        // Task 3.8에서 computeSignals → runTrigger(event) 추가
      }
    )
    .subscribe((status) => {
      logger.info("realtime subscribe status", { status });
    });

  logger.info("events attached", { channel: "budget_entries_changes" });
  // channel 변수는 이후 unsubscribe에 쓸 수 있지만 현재는 lifetime = bot lifetime이라 OK
}
```

- [ ] **Step 2: index.ts에서 호출**

```typescript
import { attachEvents } from "./triggers/event.js";

// attachSchedule(claude); 다음 줄에 추가:
attachEvents(claude);
```

- [ ] **Step 3: 빌드 + 테스트**

```bash
cd /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot && npm test && npx tsc --noEmit && npm run build
```
Expected: 27/27 pass (no new tests this task), tsc silent. Realtime 구독 자체는 라이브 검증.

- [ ] **Step 4: 라이브 검증** (이 task의 핵심 — 봇 reload + budget_entries에 INSERT 일어났을 때 로그 확인)

```bash
# 봇 reload
launchctl unload -w /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/launchd/kr.daniel.jieun.plist && \
  launchctl load -w /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/launchd/kr.daniel.jieun.plist

# 텔레그램에서 봇한테 "방금 라떼 5천원 마셨어" 같은 메시지 → 자율 기록 일어남
# 봇 로그에 "event: budget_entries INSERT" 라인 보이면 OK
tail -f /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/logs/bot.log | grep -E "event:|realtime"
```

- [ ] **Step 5: 커밋**

```bash
git add jieun-bot/src/triggers/event.ts jieun-bot/src/index.ts
git commit -m "$(cat <<'EOF'
feat(jieun-bot): Supabase Realtime + event 트리거 골격

attachEvents(claude): budget_entries 테이블의 postgres_changes (INSERT
이벤트)를 채널로 구독. 일단 stub 핸들러 — 로그만 찍음. Task 3.8에서
computeSignals → runTrigger(event) 흐름으로 확장.

봇 lifetime 동안 채널 살아있음. SIGTERM 시 process 종료되며 자동 정리.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.2 — 시그널: 카테고리 이상치

**Files:**
- Create: `jieun-bot/src/signals/types.ts` (공통 타입)
- Create: `jieun-bot/src/signals/categoryOutlier.ts`
- Create: `jieun-bot/src/signals/categoryOutlier.test.ts`

룰: *이번 주 카테고리별 지출 / 4주 평균* 비율이 1.5배 이상이고 절대값 5만원 이상이면 후보 발화.

- [ ] **Step 1: 공통 타입 (signals/types.ts)**

```typescript
export type SignalKind =
  | "category_outlier"
  | "budget_pace"
  | "routine_streak_break"
  | "avoidance_recovery"
  | "memo_frequency_shift";

export type SignalCandidate = {
  kind: SignalKind;
  evidence: Record<string, unknown>;  // 시그널별 근거 데이터 (Claude prompt에 들어감)
  computed_at: Date;
};
```

- [ ] **Step 2: 테스트 (TDD)**

`src/signals/categoryOutlier.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { computeCategoryOutlier, type BudgetRow } from "./categoryOutlier.js";

const today = new Date("2026-05-01T12:00:00+09:00");

function row(daysAgo: number, category: string, amount: number): BudgetRow {
  const d = new Date(today.getTime() - daysAgo * 86400 * 1000);
  return {
    date: d.toISOString().slice(0, 10),
    category,
    amount,
    type: "expense",
  };
}

describe("computeCategoryOutlier", () => {
  it("returns null when no data", () => {
    expect(computeCategoryOutlier([], today)).toBeNull();
  });

  it("returns null when this week within baseline", () => {
    // 4주간 식사 매주 100k → 이번주도 100k = 1배 (정상)
    const rows = [
      ...Array.from({ length: 4 }, (_, w) =>
        row(w * 7 + 1, "식사", 100000)
      ),
      row(2, "식사", 50000),  // 이번주
      row(0, "식사", 50000),
    ];
    expect(computeCategoryOutlier(rows, today)).toBeNull();
  });

  it("flags outlier when this week >=1.5x avg AND >=50k", () => {
    const rows = [
      // 4주 평균 식사 = 50k/주
      row(28, "식사", 50000),
      row(21, "식사", 50000),
      row(14, "식사", 50000),
      row(7, "식사", 50000),
      // 이번주 식사 100k (2배, 절대값 100k)
      row(3, "식사", 50000),
      row(1, "식사", 50000),
    ];
    const r = computeCategoryOutlier(rows, today);
    expect(r).not.toBeNull();
    expect(r?.kind).toBe("category_outlier");
    expect(r?.evidence.category).toBe("식사");
    expect(r?.evidence.thisWeek).toBe(100000);
    expect(r?.evidence.weeklyAvg).toBe(50000);
  });

  it("does not flag when ratio high but absolute < 50k", () => {
    // 이번주 30k vs 평균 10k = 3배인데 절대값 작음
    const rows = [
      row(28, "카페", 10000),
      row(21, "카페", 10000),
      row(14, "카페", 10000),
      row(7, "카페", 10000),
      row(0, "카페", 30000),
    ];
    expect(computeCategoryOutlier(rows, today)).toBeNull();
  });

  it("ignores 고정지출 (always recurring, not actionable)", () => {
    const rows = [
      // 4주 평균 고정지출 = 50k
      row(28, "고정지출", 50000),
      row(21, "고정지출", 50000),
      row(14, "고정지출", 50000),
      row(7, "고정지출", 50000),
      // 이번주 갑자기 200k (4배) — 무시
      row(0, "고정지출", 200000),
    ];
    expect(computeCategoryOutlier(rows, today)).toBeNull();
  });
});
```

- [ ] **Step 3: 테스트 → FAIL → 구현**

`src/signals/categoryOutlier.ts`:
```typescript
import type { SignalCandidate } from "./types.js";

const RATIO_THRESHOLD = 1.5;
const ABSOLUTE_THRESHOLD = 50_000;

export type BudgetRow = {
  date: string;       // YYYY-MM-DD
  category: string;
  amount: number;
  type: string;
};

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (86400 * 1000));
}

/**
 * 카테고리별 이번주 지출 vs 4주 평균. 비율 ≥1.5 AND 절대값 ≥50,000 이면 후보.
 * 고정지출은 제외 (예측 가능, actionable X).
 */
export function computeCategoryOutlier(rows: BudgetRow[], now: Date): SignalCandidate | null {
  if (rows.length === 0) return null;

  // 카테고리별로 그룹화. 이번주(0~6일 전) vs 이전 4주(7~34일 전).
  const thisWeek = new Map<string, number>();
  const prior = new Map<string, number>();  // 4주 합계

  for (const r of rows) {
    if (r.type !== "expense") continue;
    if (r.category === "고정지출") continue;  // 제외
    const rowDate = new Date(r.date + "T00:00:00+09:00");
    const days = daysBetween(rowDate, now);
    if (days < 0 || days > 34) continue;
    if (days <= 6) thisWeek.set(r.category, (thisWeek.get(r.category) ?? 0) + r.amount);
    else if (days <= 34) prior.set(r.category, (prior.get(r.category) ?? 0) + r.amount);
  }

  // 이번주에 있는 카테고리 중 가장 높은 ratio + 절대값 충족 찾기
  let best: SignalCandidate | null = null;
  let bestRatio = 0;
  for (const [category, weekSum] of thisWeek) {
    if (weekSum < ABSOLUTE_THRESHOLD) continue;
    const priorSum = prior.get(category) ?? 0;
    const weeklyAvg = priorSum / 4;
    if (weeklyAvg === 0) continue;  // 새 카테고리는 비교 불가, skip
    const ratio = weekSum / weeklyAvg;
    if (ratio < RATIO_THRESHOLD) continue;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = {
        kind: "category_outlier",
        evidence: {
          category,
          thisWeek: weekSum,
          weeklyAvg: Math.round(weeklyAvg),
          ratio: Math.round(ratio * 100) / 100,
        },
        computed_at: now,
      };
    }
  }
  return best;
}
```

- [ ] **Step 4: 테스트 통과 + 커밋**

```bash
cd /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot && npm test -- src/signals/
git add jieun-bot/src/signals/types.ts jieun-bot/src/signals/categoryOutlier.ts jieun-bot/src/signals/categoryOutlier.test.ts
git commit -m "$(cat <<'EOF'
feat(jieun-bot): 시그널 — 카테고리 이상치

이번주 카테고리별 지출 / 4주 평균 ≥ 1.5배 AND 절대값 ≥ 50,000 → 후보 발화.
고정지출은 제외 (정기 결제라 actionable X).

types.ts: SignalKind / SignalCandidate 공통 타입.
categoryOutlier.ts: 순수 함수. test: 5 case (no data, in baseline, outlier,
absolute X, 고정지출 skip).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.3 — 시그널: 예산 페이스

룰: 월 예산 대비 *이번달 누적 지출* / *경과 비율*. 1.2 (20% 초과 페이스) 이상이면 후보.

**Files:**
- Create: `jieun-bot/src/signals/budgetPace.ts`
- Create: `jieun-bot/src/signals/budgetPace.test.ts`

월 예산은 `src/lib/budget/summary.ts`의 `MONTHLY_BUDGET = 2_000_000` 상수 — 봇 쪽에서도 같은 값 사용.

- [ ] **Step 1: 테스트**

`src/signals/budgetPace.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { computeBudgetPace, type BudgetRow } from "./budgetPace.js";

describe("computeBudgetPace", () => {
  it("returns null when no rows", () => {
    expect(computeBudgetPace([], new Date("2026-05-15T12:00:00+09:00"), 2_000_000)).toBeNull();
  });

  it("returns null when within pace", () => {
    // 5/15 = 15일 경과 / 31일 = 48.4%. 예산 200만 → 96.8만이 적정. 90만이면 페이스 OK.
    const rows: BudgetRow[] = [
      { date: "2026-05-10", category: "식사", amount: 500000, type: "expense" },
      { date: "2026-05-12", category: "교통", amount: 400000, type: "expense" },
    ];
    expect(computeBudgetPace(rows, new Date("2026-05-15T12:00:00+09:00"), 2_000_000)).toBeNull();
  });

  it("flags overpace when ratio >= 1.2", () => {
    // 5/15 — 적정 96.8만. 실제 130만 (1.34배) → 발화.
    const rows: BudgetRow[] = [
      { date: "2026-05-10", category: "식사", amount: 800000, type: "expense" },
      { date: "2026-05-12", category: "교통", amount: 500000, type: "expense" },
    ];
    const r = computeBudgetPace(rows, new Date("2026-05-15T12:00:00+09:00"), 2_000_000);
    expect(r).not.toBeNull();
    expect(r?.kind).toBe("budget_pace");
    expect(r?.evidence.actual).toBe(1_300_000);
    expect((r?.evidence.expected as number)).toBeGreaterThan(900_000);
    expect((r?.evidence.expected as number)).toBeLessThan(1_000_000);
  });

  it("excludes 고정지출 + 월급 + 저축 from spend", () => {
    const rows: BudgetRow[] = [
      { date: "2026-05-01", category: "고정지출", amount: 1_000_000, type: "expense" }, // 제외
      { date: "2026-05-01", category: "월급", amount: 3_000_000, type: "income" },     // 제외
      { date: "2026-05-10", category: "식사", amount: 100_000, type: "expense" },       // 포함
    ];
    const r = computeBudgetPace(rows, new Date("2026-05-15T12:00:00+09:00"), 2_000_000);
    expect(r).toBeNull();  // 식사 10만은 페이스 안에
  });
});
```

- [ ] **Step 2: 구현**

`src/signals/budgetPace.ts`:
```typescript
import type { SignalCandidate } from "./types.js";

const PACE_THRESHOLD = 1.2;

export type BudgetRow = {
  date: string;
  category: string;
  amount: number;
  type: string;
};

export function computeBudgetPace(
  rows: BudgetRow[],
  now: Date,
  monthlyBudget: number
): SignalCandidate | null {
  if (rows.length === 0) return null;

  // KST 기준 이번달 첫날 + 일수 계산
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
  const todayStr = fmt.format(now);  // YYYY-MM-DD
  const [yStr, mStr] = todayStr.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const monthStart = `${yStr}-${mStr}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();
  const dayOfMonth = Number(todayStr.split("-")[2]);

  // 이번달 expense 합계 (고정지출 제외)
  let actual = 0;
  for (const r of rows) {
    if (r.type !== "expense") continue;
    if (r.category === "고정지출") continue;
    if (r.date < monthStart || r.date > todayStr) continue;
    actual += r.amount;
  }

  const expected = (monthlyBudget * dayOfMonth) / daysInMonth;
  if (actual < expected * PACE_THRESHOLD) return null;

  return {
    kind: "budget_pace",
    evidence: {
      actual,
      expected: Math.round(expected),
      ratio: Math.round((actual / expected) * 100) / 100,
      dayOfMonth,
      daysInMonth,
      monthlyBudget,
    },
    computed_at: now,
  };
}
```

- [ ] **Step 3: 커밋**

```bash
git add jieun-bot/src/signals/budgetPace.ts jieun-bot/src/signals/budgetPace.test.ts
git commit -m "feat(jieun-bot): 시그널 — 예산 페이스

이번달 누적 지출 vs (월예산 × 일자/월일수) ≥ 1.2배 → 후보 발화.
고정지출 + income + saving 제외. KST 기준 일자.

테스트: no data, within pace, overpace, exclude 고정지출 4 case.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.4 — 시그널: 루틴 streak/break

룰: 어떤 루틴 항목이든 *5일 연속 미체크* 면 회피 패턴 후보 발화.

**Files:**
- Create: `jieun-bot/src/signals/routineStreak.ts`
- Create: `jieun-bot/src/signals/routineStreak.test.ts`

routine_items + routine_checks 테이블 사용. 자세한 구조는 `src/lib/routine/today.ts` 참고.

- [ ] **Step 1: 테스트**

```typescript
import { describe, it, expect } from "vitest";
import { computeRoutineStreak, type RoutineCheckRow, type RoutineItemRow } from "./routineStreak.js";

const today = new Date("2026-05-01T12:00:00+09:00");

describe("computeRoutineStreak", () => {
  it("returns null when no items", () => {
    expect(computeRoutineStreak([], [], today)).toBeNull();
  });

  it("returns null when all items have recent checks", () => {
    const items: RoutineItemRow[] = [{ id: "i1", name: "운동", emoji: "🏃" }];
    const checks: RoutineCheckRow[] = [
      { item_id: "i1", date: "2026-04-30", checked: true },
      { item_id: "i1", date: "2026-04-29", checked: true },
    ];
    expect(computeRoutineStreak(items, checks, today)).toBeNull();
  });

  it("flags 5+ day break", () => {
    const items: RoutineItemRow[] = [{ id: "i1", name: "운동", emoji: "🏃" }];
    // 마지막 체크가 6일 전. 그 이후 체크 0.
    const checks: RoutineCheckRow[] = [
      { item_id: "i1", date: "2026-04-25", checked: true },  // 6일 전
    ];
    const r = computeRoutineStreak(items, checks, today);
    expect(r).not.toBeNull();
    expect(r?.kind).toBe("routine_streak_break");
    expect(r?.evidence.itemName).toBe("운동");
    expect(r?.evidence.daysSinceCheck).toBe(6);
  });

  it("picks the longest break when multiple items qualify", () => {
    const items: RoutineItemRow[] = [
      { id: "i1", name: "운동", emoji: "🏃" },
      { id: "i2", name: "독서", emoji: "📚" },
    ];
    const checks: RoutineCheckRow[] = [
      { item_id: "i1", date: "2026-04-25", checked: true }, // 6일 break
      { item_id: "i2", date: "2026-04-22", checked: true }, // 9일 break
    ];
    const r = computeRoutineStreak(items, checks, today);
    expect(r?.evidence.itemName).toBe("독서");
    expect(r?.evidence.daysSinceCheck).toBe(9);
  });
});
```

- [ ] **Step 2: 구현**

```typescript
import type { SignalCandidate } from "./types.js";

const BREAK_THRESHOLD_DAYS = 5;

export type RoutineItemRow = { id: string; name: string; emoji: string };
export type RoutineCheckRow = { item_id: string; date: string; checked: boolean };

function daysBetween(dateStr: string, now: Date): number {
  const a = new Date(dateStr + "T00:00:00+09:00");
  return Math.floor((now.getTime() - a.getTime()) / (86400 * 1000));
}

export function computeRoutineStreak(
  items: RoutineItemRow[],
  checks: RoutineCheckRow[],
  now: Date
): SignalCandidate | null {
  if (items.length === 0) return null;

  // item별 마지막 체크 날짜
  const lastCheck = new Map<string, string>();
  for (const c of checks) {
    if (!c.checked) continue;
    const prev = lastCheck.get(c.item_id);
    if (!prev || c.date > prev) lastCheck.set(c.item_id, c.date);
  }

  // 가장 긴 break 찾기
  let worst: { item: RoutineItemRow; days: number } | null = null;
  for (const item of items) {
    const last = lastCheck.get(item.id);
    if (!last) continue; // 한 번도 체크 안 한 routine은 skip (새로 만든 것일 수 있음)
    const days = daysBetween(last, now);
    if (days < BREAK_THRESHOLD_DAYS) continue;
    if (!worst || days > worst.days) worst = { item, days };
  }

  if (!worst) return null;
  return {
    kind: "routine_streak_break",
    evidence: {
      itemId: worst.item.id,
      itemName: worst.item.name,
      itemEmoji: worst.item.emoji,
      daysSinceCheck: worst.days,
    },
    computed_at: now,
  };
}
```

- [ ] **Step 3: 커밋** (use the same pattern as 3.2/3.3)

---

### Task 3.5 — 시그널: 회피→실행 전환

룰: 어떤 routine이 *3일 이상 미체크* 후 *오늘 체크됨* → 격려 후보.

**Files:**
- Create: `jieun-bot/src/signals/avoidanceRecovery.ts`
- Create: `jieun-bot/src/signals/avoidanceRecovery.test.ts`

- [ ] **Step 1: 테스트**

```typescript
import { describe, it, expect } from "vitest";
import { computeAvoidanceRecovery, type RoutineCheckRow } from "./avoidanceRecovery.js";

const today = new Date("2026-05-01T12:00:00+09:00");

describe("computeAvoidanceRecovery", () => {
  it("returns null when no checks today", () => {
    expect(computeAvoidanceRecovery([], today)).toBeNull();
  });

  it("flags when item checked today after 3+ day break", () => {
    const checks: RoutineCheckRow[] = [
      { item_id: "i1", date: "2026-04-26", checked: true },  // 5일 전
      { item_id: "i1", date: "2026-05-01", checked: true },  // 오늘
    ];
    const r = computeAvoidanceRecovery(checks, today);
    expect(r).not.toBeNull();
    expect(r?.kind).toBe("avoidance_recovery");
    expect(r?.evidence.itemId).toBe("i1");
    expect(r?.evidence.gapDays).toBe(5);
  });

  it("returns null when checked yesterday too (not avoidance)", () => {
    const checks: RoutineCheckRow[] = [
      { item_id: "i1", date: "2026-04-30", checked: true },
      { item_id: "i1", date: "2026-05-01", checked: true },
    ];
    expect(computeAvoidanceRecovery(checks, today)).toBeNull();
  });
});
```

- [ ] **Step 2: 구현**

```typescript
import type { SignalCandidate } from "./types.js";

const MIN_GAP_DAYS = 3;

export type RoutineCheckRow = { item_id: string; date: string; checked: boolean };

function fmtKst(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}

export function computeAvoidanceRecovery(
  checks: RoutineCheckRow[],
  now: Date
): SignalCandidate | null {
  const todayStr = fmtKst(now);

  // item별 체크 날짜 집합
  const dates = new Map<string, Set<string>>();
  for (const c of checks) {
    if (!c.checked) continue;
    if (!dates.has(c.item_id)) dates.set(c.item_id, new Set());
    dates.get(c.item_id)!.add(c.date);
  }

  for (const [itemId, dset] of dates) {
    if (!dset.has(todayStr)) continue;
    // 오늘 직전 체크일 찾기 — 가장 최근 (today 제외)
    const sorted = Array.from(dset).filter((d) => d < todayStr).sort();
    const last = sorted[sorted.length - 1];
    if (!last) continue;
    const gap = Math.floor(
      (new Date(todayStr + "T00:00:00+09:00").getTime() -
        new Date(last + "T00:00:00+09:00").getTime()) /
        (86400 * 1000)
    );
    if (gap >= MIN_GAP_DAYS) {
      return {
        kind: "avoidance_recovery",
        evidence: { itemId, gapDays: gap, lastCheckBefore: last, today: todayStr },
        computed_at: now,
      };
    }
  }
  return null;
}
```

- [ ] **Step 3: 커밋**

---

### Task 3.6 — 시그널: 메모 빈도 변화

룰: *최근 7일 메모 수* / *그 이전 7일 메모 수*. 비율 < 0.3 (급감) 또는 > 3 (급증) → 후보.

**Files:**
- Create: `jieun-bot/src/signals/memoFrequency.ts`
- Create: `jieun-bot/src/signals/memoFrequency.test.ts`

- [ ] **Step 1: 테스트**

```typescript
import { describe, it, expect } from "vitest";
import { computeMemoFrequency, type MemoRow } from "./memoFrequency.js";

const today = new Date("2026-05-15T12:00:00+09:00");

function memo(daysAgo: number): MemoRow {
  const d = new Date(today.getTime() - daysAgo * 86400 * 1000);
  return { created_at: d.toISOString() };
}

describe("computeMemoFrequency", () => {
  it("returns null when no memos", () => {
    expect(computeMemoFrequency([], today)).toBeNull();
  });

  it("returns null when in normal range", () => {
    const rows = [memo(2), memo(5), memo(10), memo(12)];  // 2/2 = 1.0
    expect(computeMemoFrequency(rows, today)).toBeNull();
  });

  it("flags drop (recent <30% of prior)", () => {
    const rows = [
      memo(2),  // recent: 1
      memo(8), memo(9), memo(10), memo(11),  // prior: 4
    ];
    const r = computeMemoFrequency(rows, today);
    expect(r?.kind).toBe("memo_frequency_shift");
    expect(r?.evidence.direction).toBe("drop");
  });

  it("flags surge (recent >3x prior)", () => {
    const rows = [
      memo(1), memo(2), memo(3), memo(4), memo(5),  // recent: 5
      memo(10),  // prior: 1
    ];
    const r = computeMemoFrequency(rows, today);
    expect(r?.evidence.direction).toBe("surge");
  });
});
```

- [ ] **Step 2: 구현**

```typescript
import type { SignalCandidate } from "./types.js";

const DROP_THRESHOLD = 0.3;
const SURGE_THRESHOLD = 3.0;

export type MemoRow = { created_at: string };

export function computeMemoFrequency(rows: MemoRow[], now: Date): SignalCandidate | null {
  if (rows.length === 0) return null;
  const sevenAgo = now.getTime() - 7 * 86400 * 1000;
  const fourteenAgo = now.getTime() - 14 * 86400 * 1000;

  let recent = 0;
  let prior = 0;
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (t >= sevenAgo) recent++;
    else if (t >= fourteenAgo) prior++;
  }

  if (prior === 0 && recent === 0) return null;
  if (prior === 0) return null;  // 갑자기 시작한 거 — 비교 불가

  const ratio = recent / prior;
  let direction: "drop" | "surge" | null = null;
  if (ratio < DROP_THRESHOLD) direction = "drop";
  else if (ratio > SURGE_THRESHOLD) direction = "surge";
  if (!direction) return null;

  return {
    kind: "memo_frequency_shift",
    evidence: { recent, prior, ratio: Math.round(ratio * 100) / 100, direction },
    computed_at: now,
  };
}
```

- [ ] **Step 3: 커밋**

---

### Task 3.7 — bot_signals CRUD + 24h dedup

**Files:**
- Create: `jieun-bot/src/db/botSignals.ts`
- Create: `jieun-bot/src/db/botSignals.test.ts`

도배 방지: 같은 `kind` 시그널이 24시간 내 이미 발화(`fired_at != null`)했으면 새 후보를 발화하지 않음.

- [ ] **Step 1: 테스트 (통합)**

```typescript
import { describe, it, expect, afterAll } from "vitest";
import { db } from "./client.js";
import { recordCandidate, lastFiredAt, markFired } from "./botSignals.js";

const TEST_KIND = "category_outlier";

describe("botSignals", () => {
  afterAll(async () => {
    await db().from("bot_signals").delete().like("user_message", "__test_%");
  });

  it("records candidate (fired_at null)", async () => {
    const id = await recordCandidate({ kind: TEST_KIND, evidence: { test: 1 } });
    expect(id).toMatch(/^[0-9a-f-]+$/);
  });

  it("lastFiredAt returns null when no fired", async () => {
    const before = await lastFiredAt(TEST_KIND);
    // 새 kind 또는 fired된 게 24h 안에 없으면 null
    expect(before).toBeNull();
  });

  it("markFired sets fired_at + user_message", async () => {
    const id = await recordCandidate({ kind: TEST_KIND, evidence: { test: 2 } });
    await markFired(id, "__test_message");
    const last = await lastFiredAt(TEST_KIND);
    expect(last).not.toBeNull();
  });
});
```

- [ ] **Step 2: 구현**

```typescript
import { db } from "./client.js";

export async function recordCandidate(args: {
  kind: string;
  evidence: Record<string, unknown>;
}): Promise<string> {
  const { data, error } = await db()
    .from("bot_signals")
    .insert({ kind: args.kind, evidence: args.evidence })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * 가장 최근에 발화(fired_at != null)된 시그널의 fired_at 시간.
 * dedup 룰: 24h 내 같은 kind가 발화했으면 새로 발화 안 함.
 */
export async function lastFiredAt(kind: string): Promise<Date | null> {
  const { data, error } = await db()
    .from("bot_signals")
    .select("fired_at")
    .eq("kind", kind)
    .not("fired_at", "is", null)
    .order("fired_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.fired_at) return null;
  return new Date(data.fired_at);
}

export async function markFired(id: string, userMessage: string): Promise<void> {
  const { error } = await db()
    .from("bot_signals")
    .update({ fired_at: new Date().toISOString(), user_message: userMessage })
    .eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 3: 커밋**

---

### Task 3.8 — 통합 — computeSignals + event 트리거 흐름

**Files:**
- Create: `jieun-bot/src/signals/compute.ts`
- Modify: `jieun-bot/src/triggers/event.ts` (stub → 통합 흐름)
- Modify: `jieun-bot/src/triggers/router.ts` (markFired 호출 — 발화 시 시그널 마킹)

흐름:
1. budget_entries INSERT 들어옴 → event 트리거 핸들러 호출
2. Supabase에서 최근 데이터 fetch (60일 budget, 60일 routine, 60일 memo)
3. computeSignals → 5종 시그널 계산
4. 각 후보에 대해 lastFiredAt(kind) 체크 → 24h 내 발화한 적 있으면 skip
5. 통과한 후보들: bot_signals에 candidate INSERT (id 보관)
6. contextSection 만들기 (각 시그널 evidence를 자연어로)
7. runTrigger(event) 호출
8. router에서 발화 성공 시 markFired(id, sentText)

- [ ] **Step 1: signals/compute.ts**

```typescript
import { db } from "../db/client.js";
import { computeCategoryOutlier } from "./categoryOutlier.js";
import { computeBudgetPace } from "./budgetPace.js";
import { computeRoutineStreak } from "./routineStreak.js";
import { computeAvoidanceRecovery } from "./avoidanceRecovery.js";
import { computeMemoFrequency } from "./memoFrequency.js";
import { lastFiredAt } from "../db/botSignals.js";
import type { SignalCandidate } from "./types.js";

const MONTHLY_BUDGET = 2_000_000;
const DEDUP_HOURS = 24;

export async function computeSignals(now: Date = new Date()): Promise<SignalCandidate[]> {
  // 60일 분량 데이터 fetch (cheaper than per-signal fetches)
  const sixtyAgo = new Date(now.getTime() - 60 * 86400 * 1000).toISOString().slice(0, 10);

  const [budgetRes, itemsRes, checksRes, memoRes] = await Promise.all([
    db().from("budget_entries").select("date, category, amount, type").gte("date", sixtyAgo),
    db().from("routine_items").select("id, name, emoji"),
    db().from("routine_checks").select("item_id, date, checked").gte("date", sixtyAgo),
    db().from("memo_entries").select("created_at").gte("created_at", sixtyAgo),
  ]);

  const budgetRows = (budgetRes.data ?? []) as { date: string; category: string; amount: number; type: string }[];
  const items = (itemsRes.data ?? []) as { id: string; name: string; emoji: string }[];
  const checks = (checksRes.data ?? []) as { item_id: string; date: string; checked: boolean }[];
  const memos = (memoRes.data ?? []) as { created_at: string }[];

  const allCandidates: (SignalCandidate | null)[] = [
    computeCategoryOutlier(budgetRows, now),
    computeBudgetPace(budgetRows, now, MONTHLY_BUDGET),
    computeRoutineStreak(items, checks, now),
    computeAvoidanceRecovery(checks, now),
    computeMemoFrequency(memos, now),
  ];

  // 24h dedup 통과한 후보만
  const dedupCutoff = now.getTime() - DEDUP_HOURS * 3600 * 1000;
  const passed: SignalCandidate[] = [];
  for (const c of allCandidates) {
    if (!c) continue;
    const last = await lastFiredAt(c.kind);
    if (last && last.getTime() > dedupCutoff) continue;
    passed.push(c);
  }
  return passed;
}
```

- [ ] **Step 2: triggers/event.ts 업데이트**

```typescript
import type { ClaudeAdapter } from "../claude/adapter.js";
import { db } from "../db/client.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";
import { computeSignals } from "../signals/compute.js";
import { recordCandidate } from "../db/botSignals.js";
import { runTrigger } from "./router.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

function evidenceToContext(candidates: { kind: string; evidence: Record<string, unknown> }[]): string {
  const lines: string[] = [];
  for (const c of candidates) {
    if (c.kind === "category_outlier") {
      const e = c.evidence as { category: string; thisWeek: number; weeklyAvg: number; ratio: number };
      lines.push(`- 카테고리 이상치: 이번주 "${e.category}" ${e.thisWeek.toLocaleString()}원 (4주 평균 ${e.weeklyAvg.toLocaleString()}원의 ${e.ratio}배)`);
    } else if (c.kind === "budget_pace") {
      const e = c.evidence as { actual: number; expected: number; ratio: number; dayOfMonth: number; daysInMonth: number };
      lines.push(`- 예산 페이스: 이번달 ${e.dayOfMonth}일째 — 누적 ${e.actual.toLocaleString()}원 (기대 ${e.expected.toLocaleString()}원의 ${e.ratio}배)`);
    } else if (c.kind === "routine_streak_break") {
      const e = c.evidence as { itemName: string; itemEmoji: string; daysSinceCheck: number };
      lines.push(`- 루틴 회피: "${e.itemEmoji} ${e.itemName}" ${e.daysSinceCheck}일째 미체크`);
    } else if (c.kind === "avoidance_recovery") {
      const e = c.evidence as { gapDays: number };
      lines.push(`- 회피→실행 전환: ${e.gapDays}일 미루다 오늘 다시 시작`);
    } else if (c.kind === "memo_frequency_shift") {
      const e = c.evidence as { recent: number; prior: number; ratio: number; direction: string };
      lines.push(`- 메모 빈도 ${e.direction === "drop" ? "급감" : "급증"}: 최근 7일 ${e.recent}개 vs 이전 7일 ${e.prior}개 (${e.ratio}배)`);
    }
  }
  return lines.join("\n");
}

export function attachEvents(claude: ClaudeAdapter): void {
  db()
    .channel("budget_entries_changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "budget_entries" },
      async (payload) => {
        const row = payload.new as { id: string };
        logger.info("event: budget INSERT", { id: row.id });

        try {
          const candidates = await computeSignals();
          if (candidates.length === 0) {
            logger.info("event: no signal candidates");
            return;
          }

          const ids: string[] = [];
          for (const c of candidates) {
            const id = await recordCandidate({ kind: c.kind, evidence: c.evidence });
            ids.push(id);
          }

          const contextSection = evidenceToContext(candidates);
          logger.info("event: signal candidates", { count: candidates.length, kinds: candidates.map((c) => c.kind) });

          await runTrigger(claude, {
            trigger: "event",
            userPrompt: `데이터 변화 감지. 아래 시그널을 보고 다영에게 한마디 건넬 만한지 판단. 답이 없을 수도 있으니 부담 없이. 침묵 OK.\n\n${contextSection}`,
            contextSection,
            // 발화 성공 시 candidate ids도 mark되어야 — router가 처리하도록 별도 옵션 추가 (Step 3)
            signalCandidateIds: ids,
          } as unknown as Parameters<typeof runTrigger>[1]);  // 임시 cast — Step 3에서 정식 타입
        } catch (err) {
          logger.error("event handler failed", { err: String(err) });
        }
      }
    )
    .subscribe((status) => {
      logger.info("realtime subscribe status", { status });
    });

  logger.info("events attached", { channel: "budget_entries_changes" });
}
```

- [ ] **Step 3: router.ts에 signalCandidateIds 처리**

`TriggerContext`에 optional `signalCandidateIds?: string[]` 추가. runTrigger에서 발화 성공 시 (cleanText 있을 때) 각 id에 markFired 호출.

```typescript
// router.ts top:
import { markFired } from "../db/botSignals.js";

export type TriggerContext = {
  trigger: Exclude<Trigger, "system">;
  userPrompt: string;
  contextSection?: string;
  signalCandidateIds?: string[];  // event 트리거에서 발화 성공 시 mark 대상
};

// runTrigger 안 — sendToOwner(cleanText, ...) 다음에:
if (cleanText && ctx.signalCandidateIds?.length) {
  for (const id of ctx.signalCandidateIds) {
    try {
      await markFired(id, cleanText);
    } catch (err) {
      logger.warn("markFired failed", { id, err: String(err) });
    }
  }
}
```

- [ ] **Step 4: 빌드 + 테스트 + 라이브 검증**

```bash
cd /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot && npm test && npx tsc --noEmit && npm run build
```
Expected: 모든 시그널 unit 테스트 + 기존 테스트 다 pass.

라이브 검증: 봇 reload + budget_entries에 새 INSERT 일어나는 상황 만들기 (텔레그램 자율 기록 또는 SMS 자동입력) → 로그에 "event: signal candidates" 라인 + Claude가 시그널 보고 발화하는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add jieun-bot/src/signals/compute.ts jieun-bot/src/triggers/event.ts jieun-bot/src/triggers/router.ts
git commit -m "feat(jieun-bot): event 트리거 통합 — 시그널 5종 + dedup + Claude 발화

budget_entries INSERT → computeSignals (60일 데이터 fetch + 5종 계산) →
24h dedup (lastFiredAt 체크) → 통과한 후보 bot_signals에 record →
contextSection 만들어 Claude에 던짐 → 발화 성공 시 markFired(candidate id).

evidenceToContext: 각 시그널 evidence를 한국어 한 줄로 변환해 prompt에
주입 (Claude가 자연스럽게 인용 가능).

router에 signalCandidateIds optional 추가 — 발화 시 mark.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### 🟢 Block 3a 체크포인트

다영이 검증할 것:
1. 봇 reload 후 budget_entries에 INSERT 일어나면 (텔레그램 자율 기록 등) 로그에 "event: signal candidates" 보임
2. 시그널 후보 있을 때만 Claude가 호출됨 — 평소엔 침묵 (대부분 평범한 INSERT는 시그널 안 잡힘)
3. 24h 안에 같은 kind 두 번째는 발화 안 함 (dedup)
4. Supabase `bot_signals` 테이블에 candidate row 쌓이는 것 확인 (`SELECT * FROM bot_signals ORDER BY computed_at DESC LIMIT 10;`)

---

### Task 3.9 — icalBuddy 캘린더 읽기 (placeholder)
### Task 3.10 — 아침/퇴근직전 브리핑에 캘린더 주입 (placeholder)
### Task 3.11 — AppleScript 등록/삭제 + osascript 래퍼 (placeholder)
### Task 3.12 — write_calendar / delete_calendar 도구 (placeholder)
### Task 3.13 — 자연어 → 구조화 → 확인 → 등록 상태머신 (placeholder)
### Task 3.14 — 캘린더 등록 → bot_writes 추적 (placeholder)

> Block 3a 완료 후 detail 작성.

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
