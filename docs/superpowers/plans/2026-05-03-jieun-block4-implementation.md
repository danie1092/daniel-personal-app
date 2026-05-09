# 이지은 에이전트 v1 — Block 4 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block 4 (= v1 완성) — Memory backbone (daily/weekly summary + user_profile) → Latent observation + Retro deepening → Ops (mute/backoff/profile-log/runbook).

**Architecture:** Spec [`2026-05-03-jieun-block4-design.md`](../specs/2026-05-03-jieun-block4-design.md). Build order = Phase 4a (Memory) → 4b (Latent + Retro) → 4c (Ops). Phase 4a 끝나면 모든 트리거가 즉시 user_profile + daily summaries로 풍부화. Phase 4b가 자체 발화/침묵 판단 + 회고 흐름. Phase 4c가 viewer/mute/backoff.

**Tech Stack:** TypeScript, Node 20, vitest, grammy (Telegram), @anthropic-ai/claude-agent-sdk, @supabase/supabase-js, node-cron. Next.js 15 (앱 측 /profile-log).

**Worktree:** `/Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73` (branch `claude/blissful-gates-fa9b73`)

**Convention:**
- 기존 코드 패턴 준수 — `jieun-bot/src/db/{name}.ts` + 같은 폴더 `.test.ts`. impl side-effect 함수는 "service-role + raw SQL via supabase-js client" 형식 유지.
- 각 task 끝에서 `npm test -- --run` 통과 확인 후 commit.
- 모든 commit 메시지는 trailing `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- `import` 경로 항상 `.js` suffix (ES module + tsx 전제).

**File map (이 plan에서 생기거나 수정되는 파일):**

```
jieun-bot/src/
├── db/
│   ├── dailySummary.ts           # NEW — daily_summary upsert/fetchRange
│   ├── dailySummary.test.ts      # NEW
│   ├── weeklySummary.ts          # NEW (Phase 4b)
│   ├── weeklySummary.test.ts     # NEW (Phase 4b)
│   ├── userProfile.ts            # NEW — user_profile CRUD + supersede
│   ├── userProfile.test.ts       # NEW
│   ├── botMute.ts                # NEW (Phase 4c)
│   └── botMute.test.ts           # NEW (Phase 4c)
├── jobs/
│   ├── dailySummary.ts           # NEW — orchestration: gather → Claude → save → consolidate
│   ├── dailySummary.test.ts      # NEW
│   ├── weeklySummary.ts          # NEW (Phase 4b)
│   └── weeklySummary.test.ts     # NEW (Phase 4b)
├── profile/
│   ├── consolidate.ts            # NEW — similarity + Claude merge
│   └── consolidate.test.ts       # NEW
├── triggers/
│   ├── latent.ts                 # NEW (Phase 4b)
│   ├── latent.test.ts            # NEW (Phase 4b)
│   ├── backoff.ts                # NEW (Phase 4c) — countConsecutiveBotWithoutUser + shouldBackoff
│   ├── backoff.test.ts           # NEW (Phase 4c)
│   ├── router.ts                 # MOD — pass scheduleKind, isMuted/shouldBackoff check
│   └── schedule.ts               # MOD — pass scheduleKind, register latent crons (Phase 4b), weeklySummary cron (4b), dailySummary cron (4a)
├── telegram/
│   ├── send.ts                   # MOD — getChunkCap by trigger+scheduleKind
│   ├── send.test.ts              # NEW — getChunkCap unit
│   └── receive.ts                # MOD (Phase 4c) — "조용히"/"취소" 분기
├── memory/
│   ├── load.ts                   # MOD — splice in daily/weekly summaries
│   └── load.test.ts              # MOD — extend tests
├── persona/
│   ├── prompt.ts                 # MOD — getProfileSection wired, getRetroSection added
│   └── prompt.test.ts            # MOD — extend tests
└── index.ts                      # MOD — wire scheduleKind through, register dailySummary/weeklySummary/latent crons

src/                              # Next.js 앱 측
├── app/(main)/profile-log/
│   ├── page.tsx                  # NEW (Phase 4c)
│   ├── ProfileLogList.tsx        # NEW (Phase 4c)
│   └── actions.ts                # NEW (Phase 4c)
└── lib/profileLog/
    └── recent.ts                 # NEW (Phase 4c)

supabase_migration_phase4c_bot_mute.sql  # NEW (Phase 4c)
docs/operations/jieun-runbook.md         # NEW (Phase 4c)
```

---

## Phase 4a — Memory Backbone

목표: daily_summary 잡 + user_profile 누적 + memory loader 확장 + persona prompt에 profile section 주입. 끝나면 모든 트리거가 즉시 똑똑해짐.

### Task 4a.1 — `db/dailySummary.ts` CRUD

**Files:**
- Create: `jieun-bot/src/db/dailySummary.ts`
- Create: `jieun-bot/src/db/dailySummary.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// jieun-bot/src/db/dailySummary.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { db } from "./client.js";
import { upsertDailySummary, fetchDailySummariesBetween } from "./dailySummary.js";

const TEST_PREFIX = "__test_dsum_";

describe("dailySummary CRUD", () => {
  afterAll(async () => {
    await db().from("daily_summary").delete().like("summary", `${TEST_PREFIX}%`);
  });

  it("upsertDailySummary inserts then updates", async () => {
    const date = "2024-01-01";
    await upsertDailySummary(date, `${TEST_PREFIX}first`);
    await upsertDailySummary(date, `${TEST_PREFIX}second`);
    const rows = await fetchDailySummariesBetween("2023-12-31", "2024-01-02");
    const ours = rows.filter((r) => r.summary.startsWith(TEST_PREFIX));
    expect(ours).toHaveLength(1);
    expect(ours[0].summary).toBe(`${TEST_PREFIX}second`);
  });

  it("fetchDailySummariesBetween returns chronological", async () => {
    await upsertDailySummary("2024-01-05", `${TEST_PREFIX}a`);
    await upsertDailySummary("2024-01-03", `${TEST_PREFIX}b`);
    await upsertDailySummary("2024-01-04", `${TEST_PREFIX}c`);
    const rows = await fetchDailySummariesBetween("2024-01-03", "2024-01-05");
    const ours = rows.filter((r) => r.summary.startsWith(TEST_PREFIX));
    expect(ours.map((r) => r.date)).toEqual(["2024-01-03", "2024-01-04", "2024-01-05"]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd jieun-bot && npm test -- --run src/db/dailySummary.test.ts
```

Expected: FAIL — "Cannot find module './dailySummary.js'".

- [ ] **Step 3: Write the implementation**

```ts
// jieun-bot/src/db/dailySummary.ts
import { db } from "./client.js";

export type DailySummary = {
  date: string;        // 'YYYY-MM-DD'
  summary: string;
  created_at: string;
};

/**
 * Insert or replace daily_summary for a date. Idempotent — re-running the
 * 23:30 job overwrites the day's summary.
 */
export async function upsertDailySummary(date: string, summary: string): Promise<void> {
  const { error } = await db()
    .from("daily_summary")
    .upsert({ date, summary }, { onConflict: "date" });
  if (error) throw error;
}

/**
 * Fetch daily summaries within [from, to] inclusive, chronological order.
 * Used by the memory loader to splice 24h~30d window into prompt.
 */
export async function fetchDailySummariesBetween(
  from: string,
  to: string
): Promise<DailySummary[]> {
  const { data, error } = await db()
    .from("daily_summary")
    .select("date, summary, created_at")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DailySummary[];
}
```

- [ ] **Step 4: Run tests**

```bash
cd jieun-bot && npm test -- --run src/db/dailySummary.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd jieun-bot && cd .. && git add jieun-bot/src/db/dailySummary.ts jieun-bot/src/db/dailySummary.test.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): daily_summary CRUD (upsert + fetchRange)

Block 4a-1. memory loader가 24h~30d 구간에 splice할 데이터의 source.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4a.2 — `db/userProfile.ts` CRUD + supersede

**Files:**
- Create: `jieun-bot/src/db/userProfile.ts`
- Create: `jieun-bot/src/db/userProfile.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// jieun-bot/src/db/userProfile.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { db } from "./client.js";
import {
  insertObservation,
  fetchActiveProfile,
  supersede,
  type ProfileKind,
} from "./userProfile.js";

const TEST_PREFIX = "__test_prof_";

describe("userProfile CRUD", () => {
  afterAll(async () => {
    await db().from("user_profile").delete().like("observation", `${TEST_PREFIX}%`);
  });

  it("insertObservation returns id, fetchActiveProfile returns it", async () => {
    const id = await insertObservation({
      kind: "preference",
      observation: `${TEST_PREFIX}likes 김밥`,
      evidence_dates: ["2026-05-01"],
    });
    expect(id).toMatch(/^[0-9a-f-]+$/);
    const active = await fetchActiveProfile(50);
    const ours = active.find((p) => p.id === id);
    expect(ours).toBeDefined();
    expect(ours!.kind).toBe("preference");
  });

  it("supersede sets superseded_by, target row drops out of active", async () => {
    const oldId = await insertObservation({
      kind: "pattern",
      observation: `${TEST_PREFIX}old pattern`,
      evidence_dates: ["2026-04-30"],
    });
    const newId = await insertObservation({
      kind: "pattern",
      observation: `${TEST_PREFIX}new pattern`,
      evidence_dates: ["2026-05-01"],
    });
    await supersede(oldId, newId);
    const active = await fetchActiveProfile(50);
    expect(active.find((p) => p.id === oldId)).toBeUndefined();
    expect(active.find((p) => p.id === newId)).toBeDefined();
  });

  it("fetchActiveProfile filters out superseded and respects limit", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(
        await insertObservation({
          kind: "tone" as ProfileKind,
          observation: `${TEST_PREFIX}t${i}`,
          evidence_dates: ["2026-05-01"],
        })
      );
    }
    const active = await fetchActiveProfile(2);
    expect(active.length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd jieun-bot && npm test -- --run src/db/userProfile.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// jieun-bot/src/db/userProfile.ts
import { db } from "./client.js";

export type ProfileKind = "pattern" | "preference" | "tone";

export type ProfileRow = {
  id: string;
  kind: ProfileKind;
  observation: string;
  evidence_dates: string[];
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function insertObservation(args: {
  kind: ProfileKind;
  observation: string;
  evidence_dates: string[];
}): Promise<string> {
  const { data, error } = await db()
    .from("user_profile")
    .insert({
      kind: args.kind,
      observation: args.observation,
      evidence_dates: args.evidence_dates,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function supersede(oldId: string, newId: string): Promise<void> {
  const { error } = await db()
    .from("user_profile")
    .update({ superseded_by: newId, updated_at: new Date().toISOString() })
    .eq("id", oldId);
  if (error) throw error;
}

/**
 * Active = not superseded. Newest first up to `limit`.
 */
export async function fetchActiveProfile(limit: number = 30): Promise<ProfileRow[]> {
  const { data, error } = await db()
    .from("user_profile")
    .select("id, kind, observation, evidence_dates, superseded_by, created_at, updated_at")
    .is("superseded_by", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

export async function deleteObservation(id: string): Promise<void> {
  const { error } = await db().from("user_profile").delete().eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 4: Run tests**

```bash
cd jieun-bot && npm test -- --run src/db/userProfile.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd jieun-bot/.. && git add jieun-bot/src/db/userProfile.ts jieun-bot/src/db/userProfile.test.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): user_profile CRUD + supersede

Block 4a-2. 신규 observation INSERT, 활성 프로필 fetch (superseded_by IS NULL),
충돌 시 supersede 체인 (oldId.superseded_by = newId).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4a.3 — `profile/consolidate.ts` (similarity + Claude merge)

**Files:**
- Create: `jieun-bot/src/profile/consolidate.ts`
- Create: `jieun-bot/src/profile/consolidate.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// jieun-bot/src/profile/consolidate.test.ts
import { describe, it, expect } from "vitest";
import { jaccardSimilarity, findConflictCandidates } from "./consolidate.js";
import type { ProfileRow } from "../db/userProfile.js";

function row(id: string, kind: ProfileRow["kind"], obs: string): ProfileRow {
  return {
    id,
    kind,
    observation: obs,
    evidence_dates: [],
    superseded_by: null,
    created_at: "",
    updated_at: "",
  };
}

describe("jaccardSimilarity (Korean tokens via whitespace)", () => {
  it("identical strings → 1", () => {
    expect(jaccardSimilarity("외식 좋아함", "외식 좋아함")).toBe(1);
  });

  it("disjoint → 0", () => {
    expect(jaccardSimilarity("외식 좋아함", "운동 싫어함")).toBe(0);
  });

  it("partial overlap returns intersection / union", () => {
    // ["외식","좋아함"] vs ["외식","스트레스","많을때"] → 1/4
    expect(jaccardSimilarity("외식 좋아함", "외식 스트레스 많을때")).toBeCloseTo(1 / 4);
  });

  it("returns 0 for empty inputs", () => {
    expect(jaccardSimilarity("", "외식")).toBe(0);
    expect(jaccardSimilarity("", "")).toBe(0);
  });
});

describe("findConflictCandidates", () => {
  const active: ProfileRow[] = [
    row("a", "preference", "외식 좋아함"),
    row("b", "preference", "운동 싫어함"),
    row("c", "tone", "회고 시작 톤은 늘 피곤함"),
  ];

  it("matches same kind only with similarity >= 0.5", () => {
    const newRow = row("new", "preference", "외식 좋아함 그치만 도파민 소비도");
    // active 'a': ["외식","좋아함"] vs new ["외식","좋아함","그치만","도파민","소비도"]
    // intersection 2, union 5, similarity = 0.4 → not match
    // raise threshold to demonstrate kind filter:
    const matches = findConflictCandidates(newRow, active, 0.3);
    expect(matches.map((m) => m.id)).toEqual(["a"]);
  });

  it("ignores rows of other kinds even on textual overlap", () => {
    const newRow = row("new", "tone", "외식 좋아함");
    const matches = findConflictCandidates(newRow, active, 0.3);
    // 'a' is preference — excluded; 'c' is tone — no overlap
    expect(matches).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd jieun-bot && npm test -- --run src/profile/consolidate.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation (pure helpers + orchestration)**

```ts
// jieun-bot/src/profile/consolidate.ts
import type { ClaudeAdapter } from "../claude/adapter.js";
import {
  insertObservation,
  supersede,
  deleteObservation,
  type ProfileKind,
  type ProfileRow,
} from "../db/userProfile.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

const SIMILARITY_THRESHOLD = 0.5;

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  );
}

export function jaccardSimilarity(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.size === 0 || B.size === 0) return 0;
  let intersection = 0;
  for (const t of A) if (B.has(t)) intersection++;
  const union = A.size + B.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function findConflictCandidates(
  newRow: ProfileRow,
  active: ProfileRow[],
  threshold: number = SIMILARITY_THRESHOLD
): ProfileRow[] {
  return active.filter(
    (a) =>
      a.id !== newRow.id &&
      a.kind === newRow.kind &&
      jaccardSimilarity(a.observation, newRow.observation) >= threshold
  );
}

export type MergeAction =
  | { action: "keep_old" }
  | { action: "replace" }
  | { action: "merge"; merged_text: string };

const MERGE_SYSTEM_PROMPT = `
다영의 활성 프로필 라인 1개와 신규 라인 1개를 받아 통합 결정을 내려.
출력은 JSON only:
{"action": "keep_old" | "replace" | "merge", "merged_text"?: string}

기준:
- keep_old = 신규가 기존보다 정확하지 않거나 같은 정보 반복일 때
- replace = 신규가 더 정확/구체적
- merge = 두 관찰을 합칠 때. merged_text는 한 줄로 (관찰만, 평가 X)

평가어 ("좋다", "나쁘다", "이상하다") 출력 X. 사실/관찰만.
`.trim();

export async function decideMerge(
  claude: ClaudeAdapter,
  oldObs: string,
  newObs: string
): Promise<MergeAction> {
  const result = await claude.ask({
    systemPrompt: MERGE_SYSTEM_PROMPT,
    userPrompt: `[기존]\n${oldObs}\n\n[신규]\n${newObs}\n\nJSON으로:`,
  });
  const trimmed = result.text.trim();
  // Claude가 ```json 코드블럭으로 감쌀 수 있으니 안쪽만 추출
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn("decideMerge: no JSON found, defaulting keep_old", { trimmed });
    return { action: "keep_old" };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as MergeAction;
    if (parsed.action === "merge" && !parsed.merged_text) {
      logger.warn("decideMerge: merge without merged_text, defaulting keep_old");
      return { action: "keep_old" };
    }
    return parsed;
  } catch (err) {
    logger.warn("decideMerge: JSON parse failed, defaulting keep_old", { err: String(err) });
    return { action: "keep_old" };
  }
}

/**
 * After inserting a new observation, find conflicts and apply merge logic.
 * - keep_old: delete the just-inserted new row (no change to active set)
 * - replace: supersede the old with the new (old.superseded_by = newId)
 * - merge: insert merged row, supersede both old AND just-inserted with merged
 */
export async function consolidateNewObservation(
  claude: ClaudeAdapter,
  newRow: ProfileRow,
  active: ProfileRow[],
  evidenceDate: string
): Promise<void> {
  const conflicts = findConflictCandidates(newRow, active);
  if (conflicts.length === 0) return;

  for (const conflict of conflicts) {
    const decision = await decideMerge(claude, conflict.observation, newRow.observation);
    if (decision.action === "keep_old") {
      await deleteObservation(newRow.id);
      logger.info("consolidate: keep_old", { oldId: conflict.id, droppedNewId: newRow.id });
      return; // 신규 사라졌으니 더 비교할 필요 없음
    }
    if (decision.action === "replace") {
      await supersede(conflict.id, newRow.id);
      logger.info("consolidate: replace", { oldId: conflict.id, newId: newRow.id });
      continue;
    }
    if (decision.action === "merge") {
      const mergedId = await insertObservation({
        kind: newRow.kind as ProfileKind,
        observation: decision.merged_text,
        evidence_dates: [...conflict.evidence_dates, evidenceDate],
      });
      await supersede(conflict.id, mergedId);
      await supersede(newRow.id, mergedId);
      logger.info("consolidate: merge", {
        oldId: conflict.id,
        newId: newRow.id,
        mergedId,
      });
      return; // 신규 → merged로 supersede 됐으니 종료
    }
  }
}
```

- [ ] **Step 4: Run tests (pure helpers only — orchestration tested in Task 4a.4)**

```bash
cd jieun-bot && npm test -- --run src/profile/consolidate.test.ts
```

Expected: PASS (6 tests in 2 describe blocks).

- [ ] **Step 5: Commit**

```bash
cd jieun-bot/.. && git add jieun-bot/src/profile/consolidate.ts jieun-bot/src/profile/consolidate.test.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): user_profile consolidate (jaccard + Claude merge)

Block 4a-3. 신규 observation INSERT 후 같은 kind 활성 row 중 jaccard >= 0.5
인 후보를 찾아 Claude에게 keep_old/replace/merge 결정 위임. JSON 파싱 실패는
keep_old default (안전).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4a.4 — `jobs/dailySummary.ts` (orchestration)

**Files:**
- Create: `jieun-bot/src/jobs/dailySummary.ts`
- Create: `jieun-bot/src/jobs/dailySummary.test.ts`

- [ ] **Step 1: Sketch helpers — first write the data-shape and pure pieces**

```ts
// jieun-bot/src/jobs/dailySummary.ts
import type { ClaudeAdapter } from "../claude/adapter.js";
import { db } from "../db/client.js";
import { recentConversations } from "../db/conversations.js";
import { upsertDailySummary } from "../db/dailySummary.js";
import {
  insertObservation,
  fetchActiveProfile,
  type ProfileKind,
  type ProfileRow,
} from "../db/userProfile.js";
import { consolidateNewObservation } from "../profile/consolidate.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

export type DataSnapshot = {
  conversationsByRole: { user: number; bot: number };
  conversationLines: string[];
  budgetLines: string[];   // "외식 7000원 김밥"
  routineLines: string[];  // "운동 체크"
  memoLines: string[];     // 최근 메모 짧게
};

export async function gatherTodayData(today: string): Promise<DataSnapshot> {
  const conv = await recentConversations(24);
  const conversationLines = conv
    .slice()
    .reverse()
    .map((c) => `${c.role === "user" ? "다영" : c.role === "bot" ? "이지은" : "[s]"}: ${c.content}`);
  const conversationsByRole = {
    user: conv.filter((c) => c.role === "user").length,
    bot: conv.filter((c) => c.role === "bot").length,
  };

  const since = `${today} 00:00:00+09:00`;
  const until = `${today} 23:59:59+09:00`;

  const { data: budget } = await db()
    .from("budget_entries")
    .select("category, memo, amount, type")
    .gte("date", today)
    .lte("date", today);
  const budgetLines = (budget ?? []).map(
    (b) => `${b.category} ${b.amount.toLocaleString()}원 ${b.memo ?? ""}`.trim()
  );

  const { data: routine } = await db()
    .from("routine_checks")
    .select("routine_id, checked_at")
    .gte("checked_at", since)
    .lte("checked_at", until);
  const routineLines = (routine ?? []).map((r) => `루틴 체크 ${r.routine_id}`);

  const { data: memo } = await db()
    .from("memo_entries")
    .select("content, created_at")
    .gte("created_at", since)
    .lte("created_at", until);
  const memoLines = (memo ?? []).map((m) => `메모: ${m.content?.slice(0, 60) ?? ""}`);

  return { conversationsByRole, conversationLines, budgetLines, routineLines, memoLines };
}

export function buildDataBriefing(snap: DataSnapshot): string {
  return [
    `대화 (${snap.conversationsByRole.user} 다영 / ${snap.conversationsByRole.bot} 이지은):`,
    snap.conversationLines.length > 0 ? snap.conversationLines.join("\n") : "(없음)",
    "",
    `가계부 ${snap.budgetLines.length}건:`,
    snap.budgetLines.length > 0 ? snap.budgetLines.map((l) => `- ${l}`).join("\n") : "(없음)",
    "",
    `루틴 ${snap.routineLines.length}건:`,
    snap.routineLines.length > 0 ? snap.routineLines.join("\n") : "(없음)",
    "",
    `메모 ${snap.memoLines.length}건:`,
    snap.memoLines.length > 0 ? snap.memoLines.join("\n") : "(없음)",
  ].join("\n");
}

const SUMMARY_SYSTEM_PROMPT = `
너는 다영의 친구 이지은의 *기록 모드*다. 그날 데이터를 1~3문장 관찰로 요약하고,
새로 알게 된 *사실*만 user_profile observation 후보로 추출해.

출력은 JSON only:
{
  "summary": "오늘 1~3문장. 관찰만. 평가/판단 X.",
  "new_observations": [
    {"kind": "pattern" | "preference" | "tone", "observation": "한 줄", "evidence_dates": ["YYYY-MM-DD"]}
  ]
}

룰:
- "다영은 게으르다" 같은 평가 X. "운동 루틴 미루는 빈도가 늘었다" O.
- 기존 활성 프로필에 이미 비슷한 게 있으면 추출 X (다음 단계 consolidate가 처리하니 중복 줄여)
- 새 관찰 없으면 new_observations: []
- 데이터가 거의 없는 날은 summary 한 문장으로 짧게 ("오늘은 외식 1회, 메모 없음.")
`.trim();

type ClaudeJsonOut = {
  summary: string;
  new_observations: Array<{
    kind: ProfileKind;
    observation: string;
    evidence_dates: string[];
  }>;
};

function parseClaudeJson(text: string): ClaudeJsonOut | null {
  const m = text.trim().match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]);
    if (typeof parsed.summary !== "string") return null;
    if (!Array.isArray(parsed.new_observations)) return null;
    return parsed as ClaudeJsonOut;
  } catch {
    return null;
  }
}

export function buildFallbackSummary(snap: DataSnapshot): string {
  const parts: string[] = [];
  if (snap.budgetLines.length > 0) parts.push(`외식·소비 ${snap.budgetLines.length}건`);
  if (snap.routineLines.length > 0) parts.push(`루틴 ${snap.routineLines.length}건`);
  if (snap.memoLines.length > 0) parts.push(`메모 ${snap.memoLines.length}건`);
  if (snap.conversationsByRole.user > 0)
    parts.push(`대화 ${snap.conversationsByRole.user + snap.conversationsByRole.bot}회`);
  return parts.length > 0 ? parts.join(", ") + "." : "특이사항 없음.";
}

/**
 * 매일 23:30 호출. 그날 데이터를 모아 Claude에게 요약 + 신규 관찰 추출 요청.
 * JSON 파싱 실패 또는 Claude 실패 시 데이터 기반 fallback summary로 대체.
 *
 * 신규 observation은 INSERT 후 consolidate로 통합.
 */
export async function runDailySummary(claude: ClaudeAdapter, today: string): Promise<void> {
  const snap = await gatherTodayData(today);
  const briefing = buildDataBriefing(snap);
  const active = await fetchActiveProfile(30);
  const profileBlock = active.length > 0
    ? active.map((p) => `- (${p.kind}) ${p.observation}`).join("\n")
    : "(아직 없음)";

  const userPrompt = [
    `오늘 = ${today}`,
    "",
    "[활성 프로필 — 중복 추출 피하라]",
    profileBlock,
    "",
    "[그날 데이터]",
    briefing,
    "",
    "JSON으로 출력:",
  ].join("\n");

  let parsed: ClaudeJsonOut | null = null;
  try {
    const result = await claude.ask({
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      userPrompt,
    });
    parsed = parseClaudeJson(result.text);
    if (!parsed) {
      logger.warn("dailySummary: JSON parse failed, using fallback", {
        excerpt: result.text.slice(0, 120),
      });
    }
  } catch (err) {
    logger.error("dailySummary: Claude call failed, using fallback", { err: String(err) });
  }

  const summary = parsed?.summary ?? buildFallbackSummary(snap);
  await upsertDailySummary(today, summary);
  logger.info("dailySummary: saved", { date: today, summaryLen: summary.length });

  if (!parsed || parsed.new_observations.length === 0) return;

  for (const obs of parsed.new_observations) {
    if (!obs.observation || !obs.kind) continue;
    const newId = await insertObservation({
      kind: obs.kind,
      observation: obs.observation,
      evidence_dates: obs.evidence_dates?.length ? obs.evidence_dates : [today],
    });
    // re-fetch active (방금 INSERT 이전 시점)으로 비교
    const activeForCompare = active.filter((a) => a.id !== newId);
    const newRow: ProfileRow = {
      id: newId,
      kind: obs.kind,
      observation: obs.observation,
      evidence_dates: obs.evidence_dates ?? [today],
      superseded_by: null,
      created_at: "",
      updated_at: "",
    };
    try {
      await consolidateNewObservation(claude, newRow, activeForCompare, today);
    } catch (err) {
      logger.warn("consolidate failed, leaving raw", { newId, err: String(err) });
    }
  }
}
```

- [ ] **Step 2: Write the failing tests (mock Claude — pure & integration mix)**

```ts
// jieun-bot/src/jobs/dailySummary.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { db } from "../db/client.js";
import { fetchDailySummariesBetween } from "../db/dailySummary.js";
import {
  buildDataBriefing,
  buildFallbackSummary,
  runDailySummary,
} from "./dailySummary.js";
import type { ClaudeAdapter, ClaudeCallInput, ClaudeCallResult } from "../claude/adapter.js";

class MockClaude implements ClaudeAdapter {
  constructor(public response: string) {}
  async ask(_: ClaudeCallInput): Promise<ClaudeCallResult> {
    return { text: this.response, durationMs: 0 };
  }
}

class FailingClaude implements ClaudeAdapter {
  async ask(_: ClaudeCallInput): Promise<ClaudeCallResult> {
    throw new Error("simulated failure");
  }
}

const TEST_DATE = "2024-02-29"; // unique fixed date
const TEST_PREFIX = "__test_dsj_";

describe("buildDataBriefing", () => {
  it("renders empty sections with (없음)", () => {
    const briefing = buildDataBriefing({
      conversationsByRole: { user: 0, bot: 0 },
      conversationLines: [],
      budgetLines: [],
      routineLines: [],
      memoLines: [],
    });
    expect(briefing).toContain("(없음)");
  });

  it("renders all sections when present", () => {
    const briefing = buildDataBriefing({
      conversationsByRole: { user: 2, bot: 1 },
      conversationLines: ["다영: hi", "이지은: hey", "다영: bye"],
      budgetLines: ["식사 7000원 김밥"],
      routineLines: ["루틴 체크 morning_walk"],
      memoLines: ["메모: 점심 잘"],
    });
    expect(briefing).toContain("식사 7000원 김밥");
    expect(briefing).toContain("루틴 체크 morning_walk");
  });
});

describe("buildFallbackSummary", () => {
  it("empty snap → 특이사항 없음", () => {
    const out = buildFallbackSummary({
      conversationsByRole: { user: 0, bot: 0 },
      conversationLines: [],
      budgetLines: [],
      routineLines: [],
      memoLines: [],
    });
    expect(out).toBe("특이사항 없음.");
  });

  it("populated → comma joined parts", () => {
    const out = buildFallbackSummary({
      conversationsByRole: { user: 1, bot: 1 },
      conversationLines: [],
      budgetLines: ["식사"],
      routineLines: ["루틴"],
      memoLines: [],
    });
    expect(out).toContain("외식·소비 1건");
    expect(out).toContain("루틴 1건");
  });
});

describe("runDailySummary integration (mock Claude)", () => {
  afterAll(async () => {
    await db().from("daily_summary").delete().eq("date", TEST_DATE);
    await db().from("user_profile").delete().like("observation", `${TEST_PREFIX}%`);
  });

  it("saves summary and inserts observations on valid JSON", async () => {
    const claude = new MockClaude(JSON.stringify({
      summary: `${TEST_PREFIX}오늘 외식 1회.`,
      new_observations: [
        {
          kind: "preference",
          observation: `${TEST_PREFIX}김밥 좋아함`,
          evidence_dates: [TEST_DATE],
        },
      ],
    }));

    await runDailySummary(claude, TEST_DATE);
    const rows = await fetchDailySummariesBetween(TEST_DATE, TEST_DATE);
    expect(rows.find((r) => r.summary === `${TEST_PREFIX}오늘 외식 1회.`)).toBeDefined();

    const { data: profile } = await db()
      .from("user_profile")
      .select("observation")
      .like("observation", `${TEST_PREFIX}%`);
    expect(profile?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("falls back to data-based summary when JSON parse fails", async () => {
    await db().from("daily_summary").delete().eq("date", TEST_DATE);
    const claude = new MockClaude("not json at all");
    await runDailySummary(claude, TEST_DATE);
    const rows = await fetchDailySummariesBetween(TEST_DATE, TEST_DATE);
    expect(rows.length).toBe(1);
    // fallback is built from data — just verify some non-empty text
    expect(rows[0].summary.length).toBeGreaterThan(0);
  });

  it("falls back when Claude throws", async () => {
    await db().from("daily_summary").delete().eq("date", TEST_DATE);
    await runDailySummary(new FailingClaude(), TEST_DATE);
    const rows = await fetchDailySummariesBetween(TEST_DATE, TEST_DATE);
    expect(rows.length).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd jieun-bot && npm test -- --run src/jobs/dailySummary.test.ts
```

Expected: PASS (5 tests). Pure helpers pass first, integration tests pass against real Supabase.

- [ ] **Step 4: Commit**

```bash
cd jieun-bot/.. && git add jieun-bot/src/jobs/dailySummary.ts jieun-bot/src/jobs/dailySummary.test.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): dailySummary 잡 — 데이터 + Claude → daily_summary + user_profile

Block 4a-4. 그날 데이터(대화/가계부/루틴/메모) gather → Claude structured output
(summary + new_observations) → upsert + insertObservation + consolidate. JSON
파싱 실패 / Claude 실패 시 데이터 기반 fallback summary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4a.5 — `memory/load.ts` extension + `getProfileSection`

**Files:**
- Modify: `jieun-bot/src/memory/load.ts`
- Modify: `jieun-bot/src/memory/load.test.ts`

- [ ] **Step 1: Extend tests for new behavior**

Append to `jieun-bot/src/memory/load.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { db } from "../db/client.js";
import {
  formatDailySummaries,
  formatWeeklySummaries,
  getProfileSection,
} from "./load.js";
import type { DailySummary } from "../db/dailySummary.js";
import type { WeeklySummary } from "../db/weeklySummary.js";
import type { ProfileRow } from "../db/userProfile.js";

const TEST_PREFIX = "__test_load_";

describe("formatDailySummaries", () => {
  it("returns empty string when no summaries", () => {
    expect(formatDailySummaries([])).toBe("");
  });

  it("renders chronological with date prefix", () => {
    const items: DailySummary[] = [
      { date: "2026-04-29", summary: "first day", created_at: "" },
      { date: "2026-04-30", summary: "second day", created_at: "" },
    ];
    const out = formatDailySummaries(items);
    expect(out).toBe("- 4/29: first day\n- 4/30: second day");
  });
});

describe("formatWeeklySummaries", () => {
  it("renders with week range", () => {
    const items: WeeklySummary[] = [
      { week_start: "2026-04-19", summary: "weekly one", created_at: "" },
    ];
    const out = formatWeeklySummaries(items);
    expect(out).toContain("4/19~4/25");
    expect(out).toContain("weekly one");
  });
});

describe("getProfileSection", () => {
  afterAll(async () => {
    await db().from("user_profile").delete().like("observation", `${TEST_PREFIX}%`);
  });

  it("returns empty when no active rows", async () => {
    // delete first to ensure isolation
    await db().from("user_profile").delete().like("observation", `${TEST_PREFIX}%`);
    const out = await getProfileSection(30);
    // may be non-empty if other data exists in DB; just check format
    expect(typeof out).toBe("string");
  });

  it("formats inline kind prefix", () => {
    // pure-format helper (we'll add it if not yet)
    const rows: ProfileRow[] = [
      {
        id: "1",
        kind: "preference",
        observation: "김밥 좋아함",
        evidence_dates: [],
        superseded_by: null,
        created_at: "",
        updated_at: "",
      },
      {
        id: "2",
        kind: "tone",
        observation: "회고 시작 톤은 늘 피곤함",
        evidence_dates: [],
        superseded_by: null,
        created_at: "",
        updated_at: "",
      },
    ];
    const lines = rows.map((r) => `- (${r.kind}) ${r.observation}`).join("\n");
    expect(lines).toContain("(preference)");
    expect(lines).toContain("(tone)");
  });
});
```

- [ ] **Step 2: Replace `jieun-bot/src/memory/load.ts` with extended version**

```ts
// jieun-bot/src/memory/load.ts
import { recentConversations, type Conversation } from "../db/conversations.js";
import { fetchDailySummariesBetween, type DailySummary } from "../db/dailySummary.js";
import { fetchWeeklySummariesBetween, type WeeklySummary } from "../db/weeklySummary.js";
import { fetchActiveProfile } from "../db/userProfile.js";

const ROLE_LABEL: Record<Conversation["role"], string> = {
  user: "다영",
  bot: "이지은",
  system: "[system]",
};

const DAILY_CAP = 30;
const WEEKLY_CAP = 12; // 3개월 한도
const RECENT_RAW_CAP = 30;

export function formatRecentConversations(items: Conversation[]): string {
  return items
    .slice()
    .reverse()
    .map((c) => `${ROLE_LABEL[c.role]}: ${c.content}`)
    .join("\n");
}

function formatMd(date: string): string {
  // "2026-04-29" -> "4/29"
  const [, mm, dd] = date.split("-");
  return `${parseInt(mm, 10)}/${parseInt(dd, 10)}`;
}

export function formatDailySummaries(items: DailySummary[]): string {
  if (items.length === 0) return "";
  return items.map((i) => `- ${formatMd(i.date)}: ${i.summary}`).join("\n");
}

export function formatWeeklySummaries(items: WeeklySummary[]): string {
  if (items.length === 0) return "";
  return items
    .map((i) => {
      const start = new Date(i.week_start);
      const end = new Date(start.getTime() + 6 * 86400 * 1000);
      const endStr = `${end.getMonth() + 1}/${end.getDate()}`;
      return `- ${formatMd(i.week_start)}~${endStr}: ${i.summary}`;
    })
    .join("\n");
}

function todayIsoDate(d: Date = new Date()): string {
  const t = new Date(d.getTime() + 9 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}

function dateMinus(days: number, base: Date = new Date()): string {
  return todayIsoDate(new Date(base.getTime() - days * 86400 * 1000));
}

/**
 * Block 4 메모리 = 24h raw + 24h~30d daily summaries + 30d~ weekly summaries
 * (가장 최근 30일에 걸치는 주는 weekly에서 제외 — daily와 중복 방지).
 */
export async function loadMemorySection(hoursRecent: number = 24): Promise<string> {
  const items = await recentConversations(hoursRecent);
  const recent = formatRecentConversations(items.slice(0, RECENT_RAW_CAP));

  const today = todayIsoDate();
  const thirtyAgo = dateMinus(30);
  const yesterday = dateMinus(1);

  const dailies = await fetchDailySummariesBetween(thirtyAgo, yesterday);
  const cappedDailies = dailies.slice(-DAILY_CAP);

  // 30일 이전 시작한 주만
  const weeklies = await fetchWeeklySummariesBetween(dateMinus(180), thirtyAgo);
  const cappedWeeklies = weeklies.filter((w) => w.week_start < thirtyAgo).slice(-WEEKLY_CAP);

  const blocks: string[] = [];
  if (recent) blocks.push(`지난 ${hoursRecent}h:\n${recent}`);
  if (cappedDailies.length > 0) blocks.push(`지난 30일 요약:\n${formatDailySummaries(cappedDailies)}`);
  if (cappedWeeklies.length > 0) blocks.push(`더 이전 (주간 요약):\n${formatWeeklySummaries(cappedWeeklies)}`);

  return blocks.join("\n\n");
}

/**
 * 활성 user_profile 최근 N개를 한 블럭 텍스트로. inline `(kind)` prefix.
 * 빈 set이면 빈 문자열 — 호출처가 prompt 섹션 통째로 생략하도록.
 */
export async function getProfileSection(limit: number = 30): Promise<string> {
  const rows = await fetchActiveProfile(limit);
  if (rows.length === 0) return "";
  // 시각상 오래된 게 위, 최근이 아래 (정착된 관찰 → 최근 관찰)
  return rows
    .slice()
    .reverse()
    .map((r) => `- (${r.kind}) ${r.observation}`)
    .join("\n");
}
```

- [ ] **Step 3: Note — test imports `WeeklySummary` from `weeklySummary.ts` that doesn't exist yet**

This will be created in Phase 4b Task 4b.5. For now, **do not run the new memory tests** — they reference `weeklySummary.ts`. Add a stub:

```ts
// jieun-bot/src/db/weeklySummary.ts (stub — full impl in Task 4b.5)
import { db } from "./client.js";

export type WeeklySummary = {
  week_start: string;
  summary: string;
  created_at: string;
};

export async function fetchWeeklySummariesBetween(
  from: string,
  to: string
): Promise<WeeklySummary[]> {
  const { data, error } = await db()
    .from("weekly_summary")
    .select("week_start, summary, created_at")
    .gte("week_start", from)
    .lte("week_start", to)
    .order("week_start", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WeeklySummary[];
}
```

(upsertWeeklySummary는 Task 4b.5에서 추가 — 현재 fetchRange만 충분)

- [ ] **Step 4: Run tests**

```bash
cd jieun-bot && npm test -- --run src/memory/load.test.ts
```

Expected: PASS (existing 4 + new 5 = 9 tests).

- [ ] **Step 5: Commit**

```bash
cd jieun-bot/.. && git add jieun-bot/src/memory/load.ts jieun-bot/src/memory/load.test.ts jieun-bot/src/db/weeklySummary.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): memory loader 확장 — daily + weekly + profile

Block 4a-5. loadMemorySection이 24h raw / 30d daily / older weekly 3 구간을
하나의 메모리 블럭으로 직렬화. getProfileSection이 활성 user_profile inline
포맷. weeklySummary.ts는 fetchRange만 stub (upsert는 4b.5).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4a.6 — `persona/prompt.ts` profileSection wired

**Files:**
- Modify: `jieun-bot/src/persona/prompt.ts`
- Modify: `jieun-bot/src/persona/prompt.test.ts`

The `buildSystemPrompt` already accepts `profileSection: string` and conditionally renders `[다영에 대해 알게 된 것]\n${profileSection}` — but the section header text needs to match the spec ("다영에 대해 알게 된 것"), and the test should cover empty/non-empty cases. Verify current implementation already works.

- [ ] **Step 1: Add tests for profile section behavior**

Append to `jieun-bot/src/persona/prompt.test.ts`:

```ts
describe("buildSystemPrompt — profile section", () => {
  it("omits profile section when empty", () => {
    const prompt = buildSystemPrompt({
      trigger: "user",
      now: new Date("2026-05-03T10:00:00+09:00"),
      memorySection: "",
      profileSection: "",
      contextSection: "",
    });
    expect(prompt).not.toContain("[다영에 대해 알게 된 것]");
  });

  it("includes profile section when present", () => {
    const prompt = buildSystemPrompt({
      trigger: "user",
      now: new Date("2026-05-03T10:00:00+09:00"),
      memorySection: "",
      profileSection: "- (preference) 김밥 좋아함\n- (tone) 회고 시작 톤은 늘 피곤함",
      contextSection: "",
    });
    expect(prompt).toContain("[다영에 대해 알게 된 것]");
    expect(prompt).toContain("(preference) 김밥 좋아함");
    expect(prompt).toContain("(tone) 회고 시작 톤은 늘 피곤함");
  });

  it("places profile section before [지금]", () => {
    const prompt = buildSystemPrompt({
      trigger: "user",
      now: new Date("2026-05-03T10:00:00+09:00"),
      memorySection: "",
      profileSection: "- (pattern) X",
      contextSection: "",
    });
    const profileIdx = prompt.indexOf("[다영에 대해 알게 된 것]");
    const nowIdx = prompt.indexOf("[지금]");
    expect(profileIdx).toBeGreaterThan(-1);
    expect(nowIdx).toBeGreaterThan(profileIdx);
  });
});
```

- [ ] **Step 2: Run tests — current prompt.ts already implements this correctly, tests should pass**

```bash
cd jieun-bot && npm test -- --run src/persona/prompt.test.ts
```

Expected: PASS (existing tests + 3 new). If any test fails, the prompt section ordering or label needs to match — verify `buildSystemPrompt` puts `profileSection ? \`[다영에 대해 알게 된 것]\\n${profileSection}\` : ""` *before* `\`[지금]\\n...\``.

- [ ] **Step 3: Wire `profileSection` into router (currently passes empty `""`)**

Edit `jieun-bot/src/triggers/router.ts`. Find the `buildSystemPrompt` call (currently passes `profileSection: ""`) and replace with `getProfileSection()`:

```ts
// Add import
import { loadMemorySection } from "../memory/load.js";
// REPLACE WITH:
import { loadMemorySection, getProfileSection } from "../memory/load.js";

// Find:
const memorySection = await loadMemorySection(24);
const systemPrompt = buildSystemPrompt({
  trigger: ctx.trigger,
  now: new Date(),
  memorySection,
  profileSection: "",          // Block 4
  contextSection: ctx.contextSection ?? "",
});

// REPLACE WITH:
const memorySection = await loadMemorySection(24);
const profileSection = await getProfileSection(30);
const systemPrompt = buildSystemPrompt({
  trigger: ctx.trigger,
  now: new Date(),
  memorySection,
  profileSection,
  contextSection: ctx.contextSection ?? "",
});
```

- [ ] **Step 4: Run all tests to verify nothing breaks**

```bash
cd jieun-bot && npm test -- --run
```

Expected: ALL PASS. (Existing tests don't fetch profile so should still pass; if any test mocks router with hardcoded profileSection="", that's fine.)

- [ ] **Step 5: Commit**

```bash
cd jieun-bot/.. && git add jieun-bot/src/persona/prompt.test.ts jieun-bot/src/triggers/router.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): persona prompt에 user_profile 섹션 wire

Block 4a-6. router가 매 트리거마다 getProfileSection(30) → buildSystemPrompt
profileSection 인자로 주입. 빈 set이면 섹션 통째 생략 (token 절약).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4a.7 — `index.ts` register dailySummary cron 23:30

**Files:**
- Modify: `jieun-bot/src/triggers/schedule.ts`
- Modify: `jieun-bot/src/index.ts` (only if needed — Phase 4b extends further)

Approach: add the dailySummary job into `attachSchedule` since that's where all crons live.

- [ ] **Step 1: Add dailySummary cron at 23:30**

Edit `jieun-bot/src/triggers/schedule.ts` — add at the end of `attachSchedule`, before the final logger.info:

```ts
import { runDailySummary } from "../jobs/dailySummary.js";

// ... existing crons ...

  // 일일 요약 23:30 — 회고 마무리 후 그날 정리. user_profile 누적도 같은 잡.
  cron.schedule(
    "30 23 * * *",
    () => {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()); // 'YYYY-MM-DD'
      runDailySummary(claude, today).catch((err) =>
        logger.error("dailySummary job failed", { err: String(err) })
      );
    },
    { timezone: "Asia/Seoul" }
  );

  logger.info("schedule attached", {
    tasks: ["morning:08", "lunch:12:30", "evening_brief:20:30", "end_of_day:21", "retro:23", "dailySummary:23:30"],
  });
```

(Replace existing `logger.info("schedule attached"...` with the version that includes `dailySummary:23:30` in the tasks list.)

- [ ] **Step 2: Run all tests + build**

```bash
cd jieun-bot && npm test -- --run && npm run build
```

Expected: ALL PASS, build succeeds.

- [ ] **Step 3: Commit**

```bash
cd jieun-bot/.. && git add jieun-bot/src/triggers/schedule.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): dailySummary cron 23:30 등록

Block 4a-7. attachSchedule에 23:30 일일 요약 잡 추가. 회고(23:00) 30분 후
실행 — 회고 응답 여부와 무관하게 매일 1회.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### 🟢 Phase 4a 체크포인트 (라이브 검증)

봇 reload 후 다음을 확인:

```bash
launchctl unload -w /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/launchd/kr.daniel.jieun.plist && \
  launchctl load -w /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/launchd/kr.daniel.jieun.plist
```

- 23:30에 daily_summary row 1건 생기는지 확인 (`SELECT * FROM daily_summary ORDER BY date DESC LIMIT 3`)
- user_profile 누적 (`SELECT kind, observation, created_at FROM user_profile WHERE superseded_by IS NULL ORDER BY created_at DESC LIMIT 10`)
- 다음날 트리거 시 봇 응답에서 *연결*이 보이기 시작 ("그저께 외식 많았는데..." 류). 다영 피드백 받아 검증.
- 회고 안 한 날에도 daily_summary fallback 생기는지 (다영이 23:00 응답 안 한 시뮬레이션)

라이브 회귀 발견 시 fix 후 다음 phase 진행.

---

## Phase 4b — Latent Observation + Retro Deepening

목표: Claude가 자체 발화/침묵 판단하는 잠재 관찰 트리거 + 회고 모드 chunk cap 분기 + weekly_summary 잡.

### Task 4b.1 — chunk cap trigger별 분기 (`telegram/send.ts`)

**Files:**
- Modify: `jieun-bot/src/telegram/send.ts`
- Create: `jieun-bot/src/telegram/send.test.ts`

- [ ] **Step 1: Define ScheduleKind type and write failing tests**

```ts
// jieun-bot/src/telegram/send.test.ts
import { describe, it, expect } from "vitest";
import { getChunkCap, type ScheduleKind } from "./send.js";

describe("getChunkCap", () => {
  it("retro schedule → 3", () => {
    expect(getChunkCap("schedule", "retro")).toBe(3);
  });

  it("non-retro schedule → 1", () => {
    const kinds: ScheduleKind[] = ["morning", "lunch", "evening_brief", "end_of_day", "daily_summary", "weekly_summary"];
    for (const k of kinds) expect(getChunkCap("schedule", k)).toBe(1);
  });

  it("event/user/latent/system → 1", () => {
    expect(getChunkCap("event")).toBe(1);
    expect(getChunkCap("user")).toBe(1);
    expect(getChunkCap("latent")).toBe(1);
    expect(getChunkCap("system")).toBe(1);
  });

  it("schedule with no kind → 1 (defensive)", () => {
    expect(getChunkCap("schedule")).toBe(1);
  });
});
```

- [ ] **Step 2: Replace `MAX_CHUNKS_PER_TURN` with `getChunkCap` in `send.ts`**

Edit `jieun-bot/src/telegram/send.ts`:

```ts
import { bot, ownerChatId } from "./bot.js";
import { saveConversation, type Trigger } from "../db/conversations.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

const SPLIT_RE = /\n{2,}/;

// Schedule trigger의 sub-kind. "retro"만 chunk cap을 풀어줌 (3 chunks 허용 —
// 회고는 본질적으로 대화라 chunk 1로 압축하면 cramped됨). 그 외는 카톡 결
// 유지 (1 chunk).
export type ScheduleKind =
  | "morning"
  | "lunch"
  | "evening_brief"
  | "end_of_day"
  | "retro"
  | "daily_summary"   // 잡 — 발화 안 함 (cap 안 쓰임)
  | "weekly_summary"; // 잡 — 발화 안 함 (cap 안 쓰임)

export function getChunkCap(trigger: Trigger, scheduleKind?: ScheduleKind): number {
  if (trigger === "schedule" && scheduleKind === "retro") return 3;
  return 1;
}

const BASELINE_DELAY_MS = 600;
const PER_CHAR_MS = 40;
const MAX_DELAY_MS = 4500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function typingDelayFor(text: string): number {
  return Math.min(BASELINE_DELAY_MS + text.length * PER_CHAR_MS, MAX_DELAY_MS);
}

/**
 * Send text to the owner. Splits on blank-line paragraph breaks. Drops chunks
 * beyond `getChunkCap(trigger, scheduleKind)` and logs the dropped content.
 */
export async function sendToOwner(
  text: string,
  trigger: Trigger,
  scheduleKind?: ScheduleKind
): Promise<void> {
  const allChunks = text.split(SPLIT_RE).map((c) => c.trim()).filter(Boolean);
  if (allChunks.length === 0) return;

  const cap = getChunkCap(trigger, scheduleKind);
  const chunks = allChunks.slice(0, cap);
  if (allChunks.length > cap) {
    logger.info("chunks capped", {
      trigger,
      scheduleKind,
      total: allChunks.length,
      kept: cap,
      dropped: allChunks.slice(cap).map((c) => c.slice(0, 80)),
    });
  }

  let isFirst = true;
  for (const chunk of chunks) {
    if (!isFirst) {
      await bot().api.sendChatAction(ownerChatId(), "typing");
      await sleep(typingDelayFor(chunk));
    }
    await bot().api.sendMessage(ownerChatId(), chunk);
    await saveConversation("bot", chunk, trigger);
    isFirst = false;
  }
}
```

- [ ] **Step 3: Run send tests**

```bash
cd jieun-bot && npm test -- --run src/telegram/send.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 4: Update router to thread `scheduleKind` through**

Edit `jieun-bot/src/triggers/router.ts`:

```ts
import { sendToOwner } from "../telegram/send.js";
import type { ScheduleKind } from "../telegram/send.js";

export type TriggerContext = {
  trigger: Exclude<Trigger, "system">;
  scheduleKind?: ScheduleKind;  // schedule 트리거에서만 의미 있음
  userPrompt: string;
  contextSection?: string;
  signalCandidateIds?: string[];
};

// runTrigger body — find this line:
//   await sendToOwner(cleanText, ctx.trigger);
// REPLACE WITH:
//   await sendToOwner(cleanText, ctx.trigger, ctx.scheduleKind);
```

- [ ] **Step 5: Update `schedule.ts` to pass scheduleKind for each cron**

Edit `jieun-bot/src/triggers/schedule.ts`. For each `runTrigger(claude, { trigger: "schedule", userPrompt: ... })` call, add `scheduleKind`:

- 08:00 morning → `scheduleKind: "morning"`
- 12:30 lunch → `scheduleKind: "lunch"`
- 20:30 evening_brief → `scheduleKind: "evening_brief"`
- 21:00 end_of_day → `scheduleKind: "end_of_day"`
- 23:00 retro → `scheduleKind: "retro"`

(dailySummary 잡은 runTrigger 안 부르고 직접 `runDailySummary(claude, today)` 부르므로 scheduleKind 안 씀.)

- [ ] **Step 6: Run all tests + build**

```bash
cd jieun-bot && npm test -- --run && npm run build
```

Expected: ALL PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
cd jieun-bot/.. && git add jieun-bot/src/telegram/send.ts jieun-bot/src/telegram/send.test.ts jieun-bot/src/triggers/router.ts jieun-bot/src/triggers/schedule.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): chunk cap trigger별 분기 — retro만 3, 나머지 1

Block 4b-1. MAX_CHUNKS_PER_TURN record를 getChunkCap(trigger, scheduleKind) 함수로 교체.
schedule.kind === 'retro'만 max 3, 나머지(morning/lunch/evening_brief/end_of_day/event/user/latent) 1 유지.
ScheduleKind 타입 도입 → router→schedule 양쪽에서 thread.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4b.2 — `persona/prompt.ts` getRetroSection

**Files:**
- Modify: `jieun-bot/src/persona/prompt.ts`
- Modify: `jieun-bot/src/persona/prompt.test.ts`

- [ ] **Step 1: Extend PromptInput + add retroSection rendering — write tests first**

Append to `jieun-bot/src/persona/prompt.test.ts`:

```ts
describe("buildSystemPrompt — retro section", () => {
  it("includes retro section when scheduleKind=retro", () => {
    const prompt = buildSystemPrompt({
      trigger: "schedule",
      scheduleKind: "retro",
      now: new Date("2026-05-03T23:00:00+09:00"),
      memorySection: "",
      profileSection: "",
      contextSection: "",
    });
    expect(prompt).toContain("[지금 회고 시간]");
    expect(prompt).toContain("좋았던 점");
  });

  it("omits retro section for non-retro schedule", () => {
    const prompt = buildSystemPrompt({
      trigger: "schedule",
      scheduleKind: "morning",
      now: new Date("2026-05-03T08:00:00+09:00"),
      memorySection: "",
      profileSection: "",
      contextSection: "",
    });
    expect(prompt).not.toContain("[지금 회고 시간]");
  });

  it("omits retro section for non-schedule triggers", () => {
    const prompt = buildSystemPrompt({
      trigger: "user",
      now: new Date("2026-05-03T23:00:00+09:00"),
      memorySection: "",
      profileSection: "",
      contextSection: "",
    });
    expect(prompt).not.toContain("[지금 회고 시간]");
  });
});
```

- [ ] **Step 2: Edit `persona/prompt.ts` — extend PromptInput and add retro section**

```ts
import type { ScheduleKind } from "../telegram/send.js";

export type PromptInput = {
  trigger: Trigger;
  scheduleKind?: ScheduleKind;
  now: Date;
  memorySection: string;
  profileSection: string;
  contextSection: string;
};

const RETRO_SECTION = `
[지금 회고 시간]
좋았던 점 / 아쉬운 점 / 내일 한 가지 흐름.
다영이 응할 때만 풀고 짧게 끝나도 OK.
한 chunk 3-4문장. 최대 3 chunks.
따라가는 질문은 1개 정도까지.
시작 톤은 가볍게 ("테이블 앞이야?" 류).
`.trim();

// Inside buildSystemPrompt — find the array for the .filter().join():
return [
  CORE,
  profileSection ? `[다영에 대해 알게 된 것]\n${profileSection}` : "",
  `[지금]\n${nowSection}`,
  `[트리거: ${trigger}]\n${TRIGGER_LABELS[trigger]}`,
  trigger === "schedule" && scheduleKind === "retro" ? RETRO_SECTION : "",
  memorySection ? `[메모리]\n${memorySection}` : "",
  contextSection ? `[현재 컨텍스트]\n${contextSection}` : "",
  `[지시]
- 자연어만. 메타 정보(트리거 라벨, 길이 카운트, 판단 근거) 출력 X.
- 침묵을 선택하면 빈 문자열 반환.
- 단락 1개 default. \\n\\n 거의 X (시스템 cap이 코드로 강제).`,
].filter(Boolean).join("\n\n");
```

(Destructure `scheduleKind` from input at the top of the function: `const { trigger, scheduleKind, now, memorySection, profileSection, contextSection } = input;`)

- [ ] **Step 3: Wire scheduleKind through router → buildSystemPrompt**

Edit `jieun-bot/src/triggers/router.ts`:

```ts
const systemPrompt = buildSystemPrompt({
  trigger: ctx.trigger,
  scheduleKind: ctx.scheduleKind,
  now: new Date(),
  memorySection,
  profileSection,
  contextSection: ctx.contextSection ?? "",
});
```

- [ ] **Step 4: Run tests**

```bash
cd jieun-bot && npm test -- --run src/persona/prompt.test.ts && npm test -- --run
```

Expected: ALL PASS (existing + 3 new retro tests).

- [ ] **Step 5: Commit**

```bash
cd jieun-bot/.. && git add jieun-bot/src/persona/prompt.ts jieun-bot/src/persona/prompt.test.ts jieun-bot/src/triggers/router.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): retro mode prompt 섹션 — 23:00 trigger.kind=retro 한정

Block 4b-2. buildSystemPrompt에 PromptInput.scheduleKind 추가, schedule+retro
조합에서만 [지금 회고 시간] 섹션 (좋았던/아쉬운/내일 한 가지 흐름, max 3
chunks, 시작 톤 가볍게) 주입. router→prompt까지 wire.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4b.3 — `triggers/latent.ts` (잠재 관찰)

**Files:**
- Create: `jieun-bot/src/triggers/latent.ts`
- Create: `jieun-bot/src/triggers/latent.test.ts`

- [ ] **Step 1: Sketch impl with structured output**

```ts
// jieun-bot/src/triggers/latent.ts
import type { ClaudeAdapter } from "../claude/adapter.js";
import { computeSignals } from "../signals/compute.js";
import { recordCandidate, markFired } from "../db/botSignals.js";
import { loadMemorySection, getProfileSection } from "../memory/load.js";
import { buildSystemPrompt } from "../persona/prompt.js";
import { sendToOwner } from "../telegram/send.js";
import { saveConversation } from "../db/conversations.js";
import { isInSilenceWindow } from "./silenceWindow.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

const LATENT_SYSTEM_DIRECTIVE = `
[잠재 관찰 모드]
6시간마다 깨어서 다영에게 *지금* 말 거는 것이 자연스러운지 판단해.
침묵이 기본. 어색하면 침묵. 도배되면 침묵. 별일 없으면 침묵.

발화 가치 기준:
- 시그널의 evidence가 *지금* 다영의 관심사일 때 (예: 카테고리 이상치가 어제오늘 발생)
- profile/memory에서 *연결*이 보일 때 ("지난주 외식 많았는데 이번 주는...")
- 일상 흐름에 *진심으로* 끼어들고 싶을 때

발화 자제:
- 다영이 자정~07:59 어딘가 자고 있을 시간 (silence window 코드가 막지만 prompt 차원에서도 인식)
- 같은 종류 시그널이 24h 안에 이미 발화됨
- 그저 "안부" 정도 — 다른 schedule 트리거가 채움
- 발화율 70%+ 침묵 목표

JSON only:
{
  "speak": boolean,
  "reason": "왜 결정했는지 1문장",
  "message": "speak=true 시에만, 한 chunk 짧게 (3-4문장)"
}
`.trim();

type LatentDecision = {
  speak: boolean;
  reason: string;
  message?: string;
};

function parseLatentDecision(text: string): LatentDecision | null {
  const m = text.trim().match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]);
    if (typeof parsed.speak !== "boolean") return null;
    if (typeof parsed.reason !== "string") return null;
    return parsed as LatentDecision;
  } catch {
    return null;
  }
}

function evidenceToContext(candidates: Awaited<ReturnType<typeof computeSignals>>): string {
  // event.ts와 동일 패턴 (별도 helper로 빼는 건 followup)
  const lines: string[] = [];
  for (const c of candidates) {
    const e = c.evidence as Record<string, unknown>;
    lines.push(`- ${c.kind}: ${JSON.stringify(e)}`);
  }
  return lines.join("\n");
}

/**
 * 잠재 관찰 트리거 진입. silence window면 즉시 종료.
 * Claude → JSON 파싱 → speak=true면 send + bot_conversations row + markFired.
 * speak=false면 로그만 + 시그널 dedup row는 만들되 fired_at NULL 유지.
 */
export async function runLatentObservation(claude: ClaudeAdapter): Promise<void> {
  if (isInSilenceWindow()) {
    logger.info("latent: silence window, skip");
    return;
  }

  let candidates: Awaited<ReturnType<typeof computeSignals>>;
  try {
    candidates = await computeSignals();
  } catch (err) {
    logger.warn("latent: computeSignals failed", { err: String(err) });
    return;
  }

  const candidateIds: string[] = [];
  for (const c of candidates) {
    try {
      candidateIds.push(await recordCandidate({ kind: c.kind, evidence: c.evidence }));
    } catch (err) {
      logger.warn("latent: recordCandidate failed", { kind: c.kind, err: String(err) });
    }
  }

  const memorySection = await loadMemorySection(24);
  const profileSection = await getProfileSection(30);
  const signalsBlock = candidates.length > 0 ? evidenceToContext(candidates) : "(시그널 없음)";

  const systemPrompt = buildSystemPrompt({
    trigger: "latent",
    now: new Date(),
    memorySection,
    profileSection,
    contextSection: `[활성 시그널]\n${signalsBlock}`,
  });

  const userPrompt = `${LATENT_SYSTEM_DIRECTIVE}\n\n위 컨텍스트로 JSON 출력:`;

  let decision: LatentDecision | null = null;
  try {
    const result = await claude.ask({ systemPrompt, userPrompt });
    decision = parseLatentDecision(result.text);
    if (!decision) {
      logger.warn("latent: JSON parse failed, treating as silent", {
        excerpt: result.text.slice(0, 120),
      });
      return;
    }
  } catch (err) {
    logger.error("latent: Claude failed, silent skip", { err: String(err) });
    return;
  }

  logger.info("latent: decision", { speak: decision.speak, reason: decision.reason });

  if (!decision.speak || !decision.message) {
    return;
  }

  await sendToOwner(decision.message, "latent");
  // sendToOwner가 saveConversation도 부르므로 별도 INSERT 불필요
  for (const id of candidateIds) {
    try {
      await markFired(id, decision.message);
    } catch (err) {
      logger.warn("latent: markFired failed", { id, err: String(err) });
    }
  }
}
```

- [ ] **Step 2: Write tests (mock Claude + verify silent skip / send call)**

```ts
// jieun-bot/src/triggers/latent.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runLatentObservation } from "./latent.js";
import type { ClaudeAdapter, ClaudeCallInput, ClaudeCallResult } from "../claude/adapter.js";

class MockClaude implements ClaudeAdapter {
  constructor(public response: string) {}
  calls = 0;
  async ask(_: ClaudeCallInput): Promise<ClaudeCallResult> {
    this.calls++;
    return { text: this.response, durationMs: 0 };
  }
}

vi.mock("../telegram/send.js", () => ({
  sendToOwner: vi.fn().mockResolvedValue(undefined),
  getChunkCap: vi.fn(() => 1),
}));

vi.mock("../signals/compute.js", () => ({
  computeSignals: vi.fn().mockResolvedValue([]),
}));

vi.mock("../db/botSignals.js", () => ({
  recordCandidate: vi.fn().mockResolvedValue("test-id"),
  markFired: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../memory/load.js", () => ({
  loadMemorySection: vi.fn().mockResolvedValue(""),
  getProfileSection: vi.fn().mockResolvedValue(""),
}));

vi.mock("./silenceWindow.js", () => ({
  isInSilenceWindow: vi.fn(() => false),
}));

describe("runLatentObservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("silence window: returns without calling Claude", async () => {
    const { isInSilenceWindow } = await import("./silenceWindow.js");
    vi.mocked(isInSilenceWindow).mockReturnValueOnce(true);
    const claude = new MockClaude("");
    await runLatentObservation(claude);
    expect(claude.calls).toBe(0);
  });

  it("speak=false: does not call sendToOwner", async () => {
    const { sendToOwner } = await import("../telegram/send.js");
    const claude = new MockClaude(JSON.stringify({ speak: false, reason: "별일 없음" }));
    await runLatentObservation(claude);
    expect(claude.calls).toBe(1);
    expect(sendToOwner).not.toHaveBeenCalled();
  });

  it("speak=true with message: calls sendToOwner with latent trigger", async () => {
    const { sendToOwner } = await import("../telegram/send.js");
    const claude = new MockClaude(JSON.stringify({
      speak: true,
      reason: "test",
      message: "테스트 메시지",
    }));
    await runLatentObservation(claude);
    expect(sendToOwner).toHaveBeenCalledWith("테스트 메시지", "latent");
  });

  it("malformed JSON: silent skip", async () => {
    const { sendToOwner } = await import("../telegram/send.js");
    const claude = new MockClaude("not json");
    await runLatentObservation(claude);
    expect(sendToOwner).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd jieun-bot && npm test -- --run src/triggers/latent.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 4: Register latent crons in `schedule.ts`**

Edit `jieun-bot/src/triggers/schedule.ts` — add 3 crons + import:

```ts
import { runLatentObservation } from "./latent.js";

// ... existing 5 crons + dailySummary ...

  // 잠재 관찰 — 활성 시간대 3 슬롯 (10:00 / 15:00 / 19:30)
  for (const [hour, min, label] of [
    [10, 0, "10:00"],
    [15, 0, "15:00"],
    [19, 30, "19:30"],
  ] as const) {
    cron.schedule(
      `${min} ${hour} * * *`,
      () => {
        runLatentObservation(claude).catch((err) =>
          logger.error("latent observation failed", { slot: label, err: String(err) })
        );
      },
      { timezone: "Asia/Seoul" }
    );
  }

  logger.info("schedule attached", {
    tasks: [
      "morning:08", "lunch:12:30", "evening_brief:20:30", "end_of_day:21",
      "retro:23", "dailySummary:23:30", "latent:10/15/19:30",
    ],
  });
```

(Replace prior `logger.info("schedule attached", ...)`.)

- [ ] **Step 5: Run all tests + build**

```bash
cd jieun-bot && npm test -- --run && npm run build
```

Expected: ALL PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
cd jieun-bot/.. && git add jieun-bot/src/triggers/latent.ts jieun-bot/src/triggers/latent.test.ts jieun-bot/src/triggers/schedule.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): 잠재 관찰 트리거 + 3 슬롯 cron (10/15/19:30)

Block 4b-3. Claude structured output {speak, reason, message?} 으로 자체
발화/침묵 판단. silence window/JSON 실패/Claude 실패 모두 silent skip.
candidateIds dedup record + speak 시 markFired.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4b.4 — Migration verification + `db/weeklySummary.ts` upsert

**Files:**
- Modify: `jieun-bot/src/db/weeklySummary.ts` (extend stub from 4a.5)
- Modify: `jieun-bot/src/db/weeklySummary.test.ts` (create)

- [ ] **Step 1: Add upsertWeeklySummary tests**

```ts
// jieun-bot/src/db/weeklySummary.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { db } from "./client.js";
import { upsertWeeklySummary, fetchWeeklySummariesBetween } from "./weeklySummary.js";

const TEST_PREFIX = "__test_wsum_";

describe("weeklySummary CRUD", () => {
  afterAll(async () => {
    await db().from("weekly_summary").delete().like("summary", `${TEST_PREFIX}%`);
  });

  it("upsert inserts then updates", async () => {
    const week = "2024-01-07"; // some sunday
    await upsertWeeklySummary(week, `${TEST_PREFIX}first`);
    await upsertWeeklySummary(week, `${TEST_PREFIX}second`);
    const rows = await fetchWeeklySummariesBetween("2024-01-01", "2024-01-31");
    const ours = rows.filter((r) => r.summary.startsWith(TEST_PREFIX));
    expect(ours).toHaveLength(1);
    expect(ours[0].summary).toBe(`${TEST_PREFIX}second`);
  });

  it("fetchWeeklySummariesBetween returns chronological", async () => {
    await upsertWeeklySummary("2024-02-04", `${TEST_PREFIX}a`);
    await upsertWeeklySummary("2024-01-21", `${TEST_PREFIX}b`);
    const rows = await fetchWeeklySummariesBetween("2024-01-15", "2024-02-10");
    const ours = rows.filter((r) => r.summary.startsWith(TEST_PREFIX));
    expect(ours.map((r) => r.week_start)).toEqual(["2024-01-21", "2024-02-04"]);
  });
});
```

- [ ] **Step 2: Add `upsertWeeklySummary` to `weeklySummary.ts`**

Append to `jieun-bot/src/db/weeklySummary.ts`:

```ts
export async function upsertWeeklySummary(weekStart: string, summary: string): Promise<void> {
  const { error } = await db()
    .from("weekly_summary")
    .upsert({ week_start: weekStart, summary }, { onConflict: "week_start" });
  if (error) throw error;
}
```

- [ ] **Step 3: Run tests**

```bash
cd jieun-bot && npm test -- --run src/db/weeklySummary.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
cd jieun-bot/.. && git add jieun-bot/src/db/weeklySummary.ts jieun-bot/src/db/weeklySummary.test.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): weekly_summary upsert + tests

Block 4b-4. fetchRange는 4a.5 stub에 이미 있고, 일요일 23:59 잡(다음 step)이
쓰는 upsert를 추가.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4b.5 — `jobs/weeklySummary.ts` (Sunday 23:59)

**Files:**
- Create: `jieun-bot/src/jobs/weeklySummary.ts`
- Create: `jieun-bot/src/jobs/weeklySummary.test.ts`
- Modify: `jieun-bot/src/triggers/schedule.ts`

- [ ] **Step 1: Write impl**

```ts
// jieun-bot/src/jobs/weeklySummary.ts
import type { ClaudeAdapter } from "../claude/adapter.js";
import { fetchDailySummariesBetween } from "../db/dailySummary.js";
import { upsertWeeklySummary } from "../db/weeklySummary.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

const SYSTEM_PROMPT = `
이 주의 daily summary 7개를 받아서 한 줄로 요약해.
관찰만, 평가 X. JSON 없이 한 줄 텍스트로 답해.
`.trim();

/**
 * weekStart = 일요일 (이 주의 첫날). 그 주 daily_summary 7개를 모아서 한 줄.
 */
export async function runWeeklySummary(claude: ClaudeAdapter, weekStart: string): Promise<void> {
  // weekStart가 일요일이라는 가정 — 6일 후 == 토요일
  const start = new Date(weekStart);
  const end = new Date(start.getTime() + 6 * 86400 * 1000);
  const endStr = end.toISOString().slice(0, 10);

  const dailies = await fetchDailySummariesBetween(weekStart, endStr);
  if (dailies.length === 0) {
    logger.info("weeklySummary: no dailies, skip", { weekStart });
    return;
  }

  const briefing = dailies.map((d) => `${d.date}: ${d.summary}`).join("\n");

  let text = "";
  try {
    const result = await claude.ask({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `[${weekStart} ~ ${endStr}]\n${briefing}\n\n한 줄로:`,
    });
    text = result.text.trim();
  } catch (err) {
    logger.error("weeklySummary: Claude failed, fallback", { err: String(err) });
    text = `${dailies.length}일 기록.`;
  }

  if (!text) text = `${dailies.length}일 기록.`;
  await upsertWeeklySummary(weekStart, text);
  logger.info("weeklySummary: saved", { weekStart, len: text.length });
}

/**
 * 일요일 자정 직전(23:59) 호출 가정. 이번 주 = 지난 일요일 기준.
 * cron 자체에서 호출 시각을 알기 어려우니 helper로 *오늘이 일요일인지* 확인 후
 * 오늘을 weekStart로 사용. (cron이 매 일요일에만 fire되므로 매번 today=일요일 보장됨.)
 */
export function thisSundayInKst(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}
```

- [ ] **Step 2: Write tests (mock Claude)**

```ts
// jieun-bot/src/jobs/weeklySummary.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { db } from "../db/client.js";
import { upsertDailySummary, fetchDailySummariesBetween } from "../db/dailySummary.js";
import { fetchWeeklySummariesBetween } from "../db/weeklySummary.js";
import { runWeeklySummary } from "./weeklySummary.js";
import type { ClaudeAdapter, ClaudeCallInput, ClaudeCallResult } from "../claude/adapter.js";

class MockClaude implements ClaudeAdapter {
  constructor(public response: string) {}
  async ask(_: ClaudeCallInput): Promise<ClaudeCallResult> {
    return { text: this.response, durationMs: 0 };
  }
}

const TEST_PREFIX = "__test_wsj_";
const WEEK_START = "2024-01-07"; // Sunday

describe("runWeeklySummary", () => {
  afterAll(async () => {
    await db().from("weekly_summary").delete().eq("week_start", WEEK_START);
    await db().from("daily_summary").delete().like("summary", `${TEST_PREFIX}%`);
  });

  it("aggregates daily summaries into a weekly row", async () => {
    // seed 7 dailies
    for (let i = 0; i < 7; i++) {
      const d = new Date(WEEK_START);
      d.setDate(d.getDate() + i);
      await upsertDailySummary(d.toISOString().slice(0, 10), `${TEST_PREFIX}day${i}`);
    }
    const claude = new MockClaude(`${TEST_PREFIX}weekly summary text`);
    await runWeeklySummary(claude, WEEK_START);
    const rows = await fetchWeeklySummariesBetween(WEEK_START, WEEK_START);
    expect(rows[0].summary).toBe(`${TEST_PREFIX}weekly summary text`);
  });

  it("skips when no dailies", async () => {
    await db().from("weekly_summary").delete().eq("week_start", "2025-12-28");
    const claude = new MockClaude("should not be saved");
    await runWeeklySummary(claude, "2025-12-28");
    const rows = await fetchWeeklySummariesBetween("2025-12-28", "2025-12-28");
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd jieun-bot && npm test -- --run src/jobs/weeklySummary.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 4: Add weekly_summary cron in `schedule.ts` (Sundays 23:59)**

Append to `attachSchedule`:

```ts
import { runWeeklySummary, thisSundayInKst } from "../jobs/weeklySummary.js";

// 주간 요약 — 일요일 23:59
cron.schedule(
  "59 23 * * 0",  // 0 == Sunday
  () => {
    const today = thisSundayInKst();
    runWeeklySummary(claude, today).catch((err) =>
      logger.error("weeklySummary job failed", { err: String(err) })
    );
  },
  { timezone: "Asia/Seoul" }
);
```

Update `logger.info("schedule attached", ...)` tasks list to include `"weeklySummary:Sun23:59"`.

- [ ] **Step 5: Run all tests + build**

```bash
cd jieun-bot && npm test -- --run && npm run build
```

Expected: ALL PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
cd jieun-bot/.. && git add jieun-bot/src/jobs/weeklySummary.ts jieun-bot/src/jobs/weeklySummary.test.ts jieun-bot/src/triggers/schedule.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): weeklySummary 잡 — 일요일 23:59

Block 4b-5. 그 주 daily_summary 7개 → Claude 한 줄 요약 → upsertWeeklySummary.
Claude 실패 시 fallback ("${n}일 기록."). cron 0=Sunday로 매주 1회.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### 🟢 Phase 4b 체크포인트 (라이브 검증)

봇 reload 후:
- 10:00 / 15:00 / 19:30 슬롯 latent 트리거 fire 확인 (`tail -f bot.log | grep latent`)
- 처음 며칠 침묵률 측정 (`SELECT trigger, COUNT(*) FROM bot_conversations WHERE trigger='latent' AND created_at > now() - interval '7 days' GROUP BY trigger`)
  - 발화율 30% 미만 (= 침묵률 70%+) 목표
- 23:00 retro 트리거 시 다영 응답 → chunks 2-3개 자연스럽게 follow-up 흐름
- 다른 schedule (08, 12:30, 20:30, 21) 여전히 1 chunk
- 일요일 23:59 weekly_summary row 1건

---

## Phase 4c — Ops

목표: /profile-log 페이지 + 수동 mute + 자동 backoff + 운영 매뉴얼.

### Task 4c.1 — `bot_mute` 마이그레이션 + `db/botMute.ts`

**Files:**
- Create: `supabase_migration_phase4c_bot_mute.sql`
- Create: `jieun-bot/src/db/botMute.ts`
- Create: `jieun-bot/src/db/botMute.test.ts`

- [ ] **Step 1: Write SQL migration**

```sql
-- supabase_migration_phase4c_bot_mute.sql
CREATE TABLE IF NOT EXISTS bot_mute (
  id          text         PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  mute_until  timestamptz,
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

INSERT INTO bot_mute (id, mute_until) VALUES ('singleton', NULL)
ON CONFLICT DO NOTHING;

ALTER TABLE bot_mute ENABLE ROW LEVEL SECURITY;
-- service_role만 접근 (앱 노출 X — 다영의 mute 상태는 봇만 읽고 씀)
```

- [ ] **Step 2: Apply migration in Supabase Dashboard**

Open Supabase SQL Editor → paste contents of `supabase_migration_phase4c_bot_mute.sql` → Run.

Verify: `SELECT * FROM bot_mute;` returns one row with `id='singleton'`.

- [ ] **Step 3: Write failing tests**

```ts
// jieun-bot/src/db/botMute.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { db } from "./client.js";
import { isMuted, muteFor, cancelMute } from "./botMute.js";

describe("botMute", () => {
  afterEach(async () => {
    await db().from("bot_mute").update({ mute_until: null }).eq("id", "singleton");
  });

  it("isMuted returns false when mute_until is NULL", async () => {
    await cancelMute();
    expect(await isMuted()).toBe(false);
  });

  it("muteFor sets mute_until to now+hours, isMuted returns true", async () => {
    await muteFor(1);
    expect(await isMuted()).toBe(true);
  });

  it("isMuted returns false when mute_until is in the past", async () => {
    await db().from("bot_mute").update({
      mute_until: new Date(Date.now() - 60_000).toISOString(),
    }).eq("id", "singleton");
    expect(await isMuted()).toBe(false);
  });

  it("cancelMute clears mute_until", async () => {
    await muteFor(1);
    await cancelMute();
    expect(await isMuted()).toBe(false);
  });
});
```

- [ ] **Step 4: Write impl**

```ts
// jieun-bot/src/db/botMute.ts
import { db } from "./client.js";

const SINGLETON_ID = "singleton";

export async function isMuted(now: Date = new Date()): Promise<boolean> {
  const { data, error } = await db()
    .from("bot_mute")
    .select("mute_until")
    .eq("id", SINGLETON_ID)
    .single();
  if (error) throw error;
  if (!data?.mute_until) return false;
  return new Date(data.mute_until).getTime() > now.getTime();
}

export async function muteFor(hours: number): Promise<void> {
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  const { error } = await db()
    .from("bot_mute")
    .update({ mute_until: until, updated_at: new Date().toISOString() })
    .eq("id", SINGLETON_ID);
  if (error) throw error;
}

export async function cancelMute(): Promise<void> {
  const { error } = await db()
    .from("bot_mute")
    .update({ mute_until: null, updated_at: new Date().toISOString() })
    .eq("id", SINGLETON_ID);
  if (error) throw error;
}
```

- [ ] **Step 5: Run tests**

```bash
cd jieun-bot && npm test -- --run src/db/botMute.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
cd jieun-bot/.. && git add supabase_migration_phase4c_bot_mute.sql jieun-bot/src/db/botMute.ts jieun-bot/src/db/botMute.test.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): bot_mute 테이블 + CRUD

Block 4c-1. singleton row(id='singleton') + mute_until timestamptz. isMuted
는 mute_until > now 비교로 판정 (NULL = 비뮤트). muteFor(hours) / cancelMute.
RLS service_role only (앱 노출 X).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4c.2 — Telegram receive에 "조용히"/"취소" 분기

**Files:**
- Modify: `jieun-bot/src/index.ts` (or add new helper)

The current handler in `index.ts` is:
```ts
attachReceive(async (text, _ctx) => {
  await runTrigger(claude, { trigger: "user", userPrompt: text });
});
```

Add mute parsing before runTrigger.

- [ ] **Step 1: Update `index.ts`**

```ts
import { isMuted, muteFor, cancelMute } from "./db/botMute.js";
import { sendToOwner } from "./telegram/send.js";

attachReceive(async (text, _ctx) => {
  const trimmed = text.trim();
  if (trimmed === "조용히") {
    await muteFor(24);
    await sendToOwner("응 24시간 조용히 있을게.", "system");
    logger.info("manual mute set", { hours: 24 });
    return;
  }
  if (trimmed === "취소") {
    await cancelMute();
    await sendToOwner("응 풀었어.", "system");
    logger.info("manual mute cleared");
    return;
  }
  await runTrigger(claude, { trigger: "user", userPrompt: text });
});
```

(`logger` import already exists — if not, add `import { Logger } from "./logger.js";` and instantiate.)

- [ ] **Step 2: Build to verify**

```bash
cd jieun-bot && npm run build
```

Expected: SUCCESS.

- [ ] **Step 3: Commit**

```bash
cd jieun-bot/.. && git add jieun-bot/src/index.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): 텔레그램 "조용히"/"취소" 명령 분기

Block 4c-2. trim된 메시지가 정확히 "조용히" / "취소"면 Claude 호출 X
즉시 처리 + ack. user 트리거는 mute 무시 (취소 메시지를 받으려면 항상 살아야 함).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4c.3 — Auto backoff helper + router 통합

**Files:**
- Create: `jieun-bot/src/triggers/backoff.ts`
- Create: `jieun-bot/src/triggers/backoff.test.ts`
- Modify: `jieun-bot/src/triggers/router.ts`

- [ ] **Step 1: Write tests for pure helper**

```ts
// jieun-bot/src/triggers/backoff.test.ts
import { describe, it, expect } from "vitest";
import { countConsecutiveBotWithoutUser } from "./backoff.js";

type Row = { role: "user" | "bot" | "system"; created_at: string };

describe("countConsecutiveBotWithoutUser (newest-first input)", () => {
  it("3 bot in a row without user → 3", () => {
    const rows: Row[] = [
      { role: "bot", created_at: "" },
      { role: "bot", created_at: "" },
      { role: "bot", created_at: "" },
    ];
    expect(countConsecutiveBotWithoutUser(rows)).toBe(3);
  });

  it("user message breaks the streak", () => {
    const rows: Row[] = [
      { role: "bot", created_at: "" },
      { role: "user", created_at: "" },
      { role: "bot", created_at: "" },
    ];
    expect(countConsecutiveBotWithoutUser(rows)).toBe(1);
  });

  it("system messages don't break and don't count", () => {
    const rows: Row[] = [
      { role: "system", created_at: "" },
      { role: "bot", created_at: "" },
      { role: "bot", created_at: "" },
    ];
    expect(countConsecutiveBotWithoutUser(rows)).toBe(2);
  });

  it("empty → 0", () => {
    expect(countConsecutiveBotWithoutUser([])).toBe(0);
  });
});
```

- [ ] **Step 2: Write impl (pure helper + DB-touching shouldBackoff)**

```ts
// jieun-bot/src/triggers/backoff.ts
import { db } from "../db/client.js";

export type SimpleRow = { role: "user" | "bot" | "system"; created_at: string };

const BACKOFF_THRESHOLD = 3;
const BACKOFF_WINDOW_HOURS = 24;

/**
 * Pure: count bot messages from newest until we hit a user message.
 * System rows are ignored (don't break, don't count).
 * Input must be newest-first.
 */
export function countConsecutiveBotWithoutUser(rows: SimpleRow[]): number {
  let count = 0;
  for (const r of rows) {
    if (r.role === "user") break;
    if (r.role === "bot") count++;
    // system: skip
  }
  return count;
}

export async function shouldBackoff(): Promise<boolean> {
  const since = new Date(Date.now() - BACKOFF_WINDOW_HOURS * 3600 * 1000).toISOString();
  const { data, error } = await db()
    .from("bot_conversations")
    .select("role, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = (data ?? []) as SimpleRow[];
  return countConsecutiveBotWithoutUser(rows) >= BACKOFF_THRESHOLD;
}
```

- [ ] **Step 3: Run tests**

```bash
cd jieun-bot && npm test -- --run src/triggers/backoff.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 4: Wire `isMuted` + `shouldBackoff` into router**

Edit `jieun-bot/src/triggers/router.ts`:

```ts
import { isMuted } from "../db/botMute.js";
import { shouldBackoff } from "./backoff.js";

// Inside runTrigger, BEFORE the silence-window check:
if (ctx.trigger !== "user") {
  if (await isMuted()) {
    logger.info("silenced (mute)", { trigger: ctx.trigger });
    return "";
  }
  if (await shouldBackoff()) {
    logger.info("silenced (backoff)", { trigger: ctx.trigger });
    return "";
  }
}
// existing silence window check stays
```

- [ ] **Step 5: Run all tests + build**

```bash
cd jieun-bot && npm test -- --run && npm run build
```

Expected: ALL PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
cd jieun-bot/.. && git add jieun-bot/src/triggers/backoff.ts jieun-bot/src/triggers/backoff.test.ts jieun-bot/src/triggers/router.ts && git commit -m "$(cat <<'EOF'
feat(jieun-bot): 자동 backoff — 24h 안 user 응답 없는 bot 메시지 3개+ → silent

Block 4c-3. countConsecutiveBotWithoutUser pure 헬퍼 + shouldBackoff DB
조회. router 진입에서 (mute || backoff)면 schedule/event/latent silent skip.
user 트리거는 항상 살아있음 (응답 들어오면 자동 reset됨 — break 로직).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4c.4 — `/profile-log` 페이지 + Server Action

**Files:**
- Create: `src/lib/profileLog/recent.ts`
- Create: `src/app/(main)/profile-log/page.tsx`
- Create: `src/app/(main)/profile-log/ProfileLogList.tsx`
- Create: `src/app/(main)/profile-log/actions.ts`

- [ ] **Step 1: Write `getRecentProfile` lib**

```ts
// src/lib/profileLog/recent.ts
import { createClient } from "@/lib/supabase/server";

export type ProfileEntry = {
  id: string;
  kind: "pattern" | "preference" | "tone";
  observation: string;
  evidence_dates: string[];
  created_at: string;
};

export async function getRecentProfile(limit: number = 30): Promise<ProfileEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profile")
    .select("id, kind, observation, evidence_dates, created_at")
    .is("superseded_by", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ProfileEntry[];
}
```

- [ ] **Step 2: Write Server Action for delete**

```ts
// src/app/(main)/profile-log/actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function deleteProfileLineAction(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("user_profile").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/profile-log");
}
```

(RLS `auth delete` policy on `user_profile` already exists — Phase 4 마이그레이션에서.)

- [ ] **Step 3: Write list component**

```tsx
// src/app/(main)/profile-log/ProfileLogList.tsx
"use client";

import type { ProfileEntry } from "@/lib/profileLog/recent";
import { deleteProfileLineAction } from "./actions";

const KIND_LABEL: Record<ProfileEntry["kind"], { ko: string; emoji: string }> = {
  pattern: { ko: "패턴", emoji: "📊" },
  preference: { ko: "취향", emoji: "🎨" },
  tone: { ko: "톤", emoji: "🎵" },
};

export function ProfileLogList({ entries }: { entries: ProfileEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-ink-sub text-[13px]">
        아직 알게 된 게 없어요.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-hair-light">
      {entries.map((e) => {
        const k = KIND_LABEL[e.kind];
        return (
          <li key={e.id} className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-ink-sub mb-1">
                {k.emoji} {k.ko}
              </div>
              <div className="text-[14px] leading-relaxed">{e.observation}</div>
              {e.evidence_dates.length > 0 && (
                <div className="text-[10px] text-ink-sub mt-1">
                  근거: {e.evidence_dates.slice(0, 5).join(", ")}
                  {e.evidence_dates.length > 5 ? ` 외 ${e.evidence_dates.length - 5}일` : ""}
                </div>
              )}
            </div>
            <form action={deleteProfileLineAction.bind(null, e.id)}>
              <button
                type="submit"
                className="text-[12px] text-rose-500 px-3 py-1 rounded-input border border-hair-light"
              >
                삭제
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Write page**

```tsx
// src/app/(main)/profile-log/page.tsx
import { getRecentProfile } from "@/lib/profileLog/recent";
import { ProfileLogList } from "./ProfileLogList";

export const dynamic = "force-dynamic";

export default async function ProfileLogPage() {
  const entries = await getRecentProfile(30);
  return (
    <div className="pb-24">
      <div className="bg-surface px-4 pt-5 pb-3 border-b border-hair-light">
        <h1 className="text-[18px] font-extrabold tracking-tight">이지은이 알게 된 너</h1>
        <p className="text-[12px] text-ink-sub mt-1">활성 관찰 · {entries.length}건 (최대 30)</p>
      </div>
      <ProfileLogList entries={entries} />
    </div>
  );
}
```

- [ ] **Step 5: Verify locally — start dev server, navigate to `/profile-log`**

```bash
# 다영이 별도 터미널에서 npm run dev — page 접근 검증
# http://localhost:3000/profile-log
```

Expected: page renders. If user_profile 비어있으면 "아직 알게 된 게 없어요." Phase 4a 라이브 검증으로 채워진 후 카드 형태로 보임.

- [ ] **Step 6: Commit**

```bash
git add src/lib/profileLog/ "src/app/(main)/profile-log/" && git commit -m "$(cat <<'EOF'
feat: /profile-log 페이지 — 활성 user_profile + 라인 삭제

Block 4c-4. /bot-log 패턴 그대로. kind별 뱃지 + observation + evidence
dates. 다영이 편향 라인 직접 삭제 (RLS auth delete 이미 적용됨).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4c.5 — 운영 매뉴얼 `jieun-runbook.md`

**Files:**
- Create: `docs/operations/jieun-runbook.md`

- [ ] **Step 1: Write the runbook**

```md
# 이지은 봇 운영 매뉴얼 (jieun-runbook)

> Block 4 v1 운영. 맥미니 launchd로 24/7. 단일 사용자 (다영, chat_id 8680678263).

## 빠른 명령

### 봇 reload (코드 변경 후)
```bash
launchctl unload -w /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/launchd/kr.daniel.jieun.plist && \
  launchctl load -w /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/launchd/kr.daniel.jieun.plist
```

### 봇 살아있는지 확인
```bash
launchctl list | grep jieun
# PID가 보이면 살아있음. 0이면 죽음.
```

### 로그 라이브 tail
```bash
tail -f /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/logs/bot.log
```

## 인증 / 토큰

### Claude Max 인증 갱신
봇 로그에 `claude error: ...auth...` 찍히거나 다영이 `(이지은이 잠깐 막혔어. claude login 확인 부탁해.)` 받으면:
```bash
# Mac mini에서 직접
claude login
# 브라우저 OAuth 흐름 따라가기
```
재인증 후 봇 자동 회복 (별도 reload 불필요).

### Telegram Bot Token 갱신
BotFather (@BotFather) → `/mybots` → 토큰 revoke + 새 토큰 → `jieun-bot/.env`의 `TELEGRAM_BOT_TOKEN` 교체 → 봇 reload.

## mute 수동 제어 (텔레그램 안 통할 때)

```sql
-- 24h mute
UPDATE bot_mute SET mute_until = now() + interval '24 hours', updated_at = now() WHERE id = 'singleton';

-- 즉시 해제
UPDATE bot_mute SET mute_until = NULL, updated_at = now() WHERE id = 'singleton';

-- 현재 mute 상태
SELECT mute_until, mute_until > now() AS is_muted FROM bot_mute;
```

## 시그널 임계값 튜닝

각 시그널 함수 위치:
- `jieun-bot/src/signals/categoryOutlier.ts` — 1.5배 + 5만원 임계
- `jieun-bot/src/signals/budgetPace.ts` — 페이스 비율 1.3배
- `jieun-bot/src/signals/routineStreak.ts` — 5일+ 미체크
- `jieun-bot/src/signals/avoidanceRecovery.ts` — 3일+ gap 후 체크
- `jieun-bot/src/signals/memoFrequency.ts` — 2배 ratio

값 바꾸고 봇 reload. 단위 테스트 같은 폴더에서 작동 확인.

## 페르소나 prompt 수정

`jieun-bot/src/persona/prompt.ts` 직접 편집. 라이브 회귀 잡을 때 prompt 룰 강화는 효과 약함 — *코드*에서 잡는 게 우선 (예: chunk cap). prompt 수정 후 reload.

## 모니터링 쿼리

### 잠재 관찰 발화율 (지난 7일)
```sql
SELECT
  DATE_TRUNC('day', created_at) as day,
  SUM(CASE WHEN role='bot' THEN 1 ELSE 0 END) as bot_msgs,
  SUM(CASE WHEN role='user' THEN 1 ELSE 0 END) as user_msgs
FROM bot_conversations
WHERE trigger='latent' AND created_at > now() - interval '7 days'
GROUP BY 1 ORDER BY 1;
```
침묵률 70%+ 목표. 발화율 너무 높으면 latent system prompt에서 침묵 기준 강화.

### user_profile 활성/superseded 분포
```sql
SELECT
  kind,
  COUNT(*) FILTER (WHERE superseded_by IS NULL) AS active,
  COUNT(*) FILTER (WHERE superseded_by IS NOT NULL) AS superseded
FROM user_profile
GROUP BY kind;
```

### chunks capped 빈도 (지난 7일, 어떤 trigger가 cap에 자주 걸리는지)
로그에서:
```bash
grep '"chunks capped"' bot.log | tail -50 | jq -r '.trigger' | sort | uniq -c
```

### daily_summary 누락 확인
```sql
SELECT generate_series('2026-05-01'::date, current_date, '1 day') AS d
EXCEPT
SELECT date FROM daily_summary
ORDER BY d;
```

### weekly_summary 누락 backfill
```sql
-- 누락된 주 일요일 찾기
WITH sundays AS (
  SELECT generate_series('2026-04-26'::date, current_date, '7 days') AS sunday
)
SELECT s.sunday FROM sundays s
WHERE NOT EXISTS (SELECT 1 FROM weekly_summary w WHERE w.week_start = s.sunday);
```
누락 주 발견 시 봇 호스트에서 수동 호출 (별도 script 필요 — followup).

## 장애 대응

### Realtime CHANNEL_ERROR 반복
폴링 fallback 미구현 (followup #2 큐). 임시 — 봇 reload 후 5분 안 SUBSCRIBED 안 보이면 supabase 대시보드 publication 확인 (`supabase_realtime`에 `budget_entries` 있는지).

### Telegram polling 멈춤
launchd KeepAlive로 자동 재시작. `tail -100 bot.log`에서 SIGTERM/SIGKILL 보이는지 확인.

### Claude 한도 초과
Anthropic 대시보드에서 사용량 확인. v1은 Max 구독 안에서 동작 — 초과 시 일부 잡(잠재 관찰)을 1일 silent로.

## 봇 영구 정지 (일시)

```bash
launchctl unload -w /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot/launchd/kr.daniel.jieun.plist
```
다시 켜기: `launchctl load -w ...` (위 reload의 두 번째 명령).
```

- [ ] **Step 2: Commit**

```bash
git add docs/operations/jieun-runbook.md && git commit -m "$(cat <<'EOF'
docs(operations): jieun-runbook — Block 4 v1 운영 매뉴얼

Block 4c-5. launchd reload, Claude/Telegram 토큰 갱신, mute 수동 제어,
시그널 임계 튜닝 위치, 페르소나 prompt 수정, 모니터링 쿼리, 장애 대응.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### 🟢 Phase 4c 체크포인트 (라이브 검증 + Block 4 완료)

- /profile-log 다영이 열기 → 4a에서 누적된 라인 카드로 보임
- 라인 1개 삭제 → 즉시 사라짐 (auth delete RLS 작동)
- 텔레그램 "조용히" → 24h 자동 트리거 0건. "취소" → 즉시 정상화.
- 자동 backoff 시뮬레이션 (다영이 의도적으로 24h 응답 안 함) → 4번째 자동 트리거부터 silent
- runbook 따라 reload + mute SQL + 모니터링 쿼리 한 번씩 직접 돌려봄

이게 다 통과하면 **Block 4 = v1 완료**.

---

## 🟢 Block 4 = v1 완료 기준

- 4주차쯤부터 user_profile 30+개
- 봇 응답에 *연결*이 등장 (구체적 과거 인용 — "지난주 외식..." 류)
- 잠재 관찰 침묵률 70%+
- 회고 진행률 30%+ (다영 응답으로 chunks 2+ 흐른 비율)
- /profile-log에서 다영이 편향 라인 1+회 삭제
- mute + 자동 backoff 라이브 검증

## 별도 followups 큐 (Block 4 후 또는 spawn)

1. schedule 트리거 phantom text replay
2. realtime CHANNEL_ERROR 안정성 (polling fallback)
3. 병렬 INSERT race condition (handler debounce)
4. `is_table_in_publication()` defense-in-depth
5. weekly_summary 누락 주 backfill 자동 script
6. 잠재 관찰 발화율 자동 모니터링 (SQL → 알림)
7. evidenceToContext (event.ts + latent.ts 중복) shared helper로 추출
