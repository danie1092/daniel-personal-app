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

> Block 1 완료 후 본 plan에 Task 2.1~2.X 채워 넣음. 1차 헤더만 둠 — 다영 OK 시 작성.

### Task 2.1 — 트리거 라우터 공통 흐름 (placeholder)
### Task 2.2 — 점심 노크 12:30 (node-cron)
### Task 2.3 — 도구 정의 + write_db
### Task 2.4 — Claude Agent SDK에 도구 노출
### Task 2.5 — bot_writes 추적
### Task 2.6 — Next.js `/bot-log` 페이지 (열람)
### Task 2.7 — `/bot-log` 수정/삭제 Server Action
### Task 2.8 — 시간 트리거 4개 추가 (08:00 / 20:30 / 21:00 / 23:00)
### Task 2.9 — 자정 이후 하드 침묵

### 🟢 Block 2 체크포인트
점심 노크 자동 발송, 다영 답하면 가계부에 자동 기록, /bot-log에서 사후 수정 가능.

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
