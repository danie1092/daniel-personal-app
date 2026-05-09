# 이지은 v1 — Block 3b: Apple Calendar read/write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block 3a까지 완료된 봇에 Apple Calendar 읽기 (icalBuddy) + 쓰기 (osascript) + 자연어 → 구조화 → 다영 승인 → 등록 흐름 + bot_writes 매개 삭제 흐름을 박는다. 부모 spec 결정사항 #23 + 본 plan의 sub-spec [`2026-05-03-jieun-block-3b-calendar-design.md`](../specs/2026-05-03-jieun-block-3b-calendar-design.md)의 D1~D5 그대로.

**Architecture:** 새 `jieun-bot/src/calendar/` 디렉토리에 5개 모듈 (read/write/parse/pending/context) + applescripts 2개. 액션 4종 추가 (`propose_calendar_event`, `propose_calendar_delete`, `confirm_calendar_action`, `cancel_calendar_action`). 데이터 모델 변경 없음 — 기존 `bot_writes`에 `target_table='apple_calendar'` 패턴으로 INSERT.

**Tech Stack:** TypeScript / Node ESM, `child_process.execFile` (icalBuddy/osascript), zod (action schema), Vitest (unit), node-cron (이미 있음), Supabase service_role (`bot_writes` write).

---

## Phase 3b-A — 인프라 (read/write 래퍼 + TCC 권한 게이트)

### Task 3.9 — `calendar/read.ts` (icalBuddy 래퍼)

**Files:**
- Create: `jieun-bot/src/calendar/read.ts`
- Create: `jieun-bot/src/calendar/read.test.ts`
- Modify: `jieun-bot/src/env.ts` — `JIEUN_CALENDAR_INCLUDE` 환경변수 추가
- Modify: `jieun-bot/.env.example` — 환경변수 예시 추가

**Goal:** icalBuddy를 child_process로 호출, 개인 캘린더만 격리, plain-text 출력을 정형 `Event[]`로 파싱. Google 업무 캘린더 절대 미접근.

**왜 `-ic` (include) 명시인가**: spec D1 보안 룰 — `-ec` (exclude)는 새 캘린더가 추가되면 자동으로 포함되므로 화이트리스트(`-ic`)가 안전.

- [ ] **Step 1: env 확장**

`jieun-bot/src/env.ts` (load 함수 안에서):
```ts
// 기존 require 항목 옆에 추가
JIEUN_CALENDAR_INCLUDE: process.env.JIEUN_CALENDAR_INCLUDE ?? "",
```

`jieun-bot/.env.example` 끝에 추가:
```
# Apple Calendar 개인 캘린더 이름 (icalBuddy + osascript include 화이트리스트)
# Calendar.app 좌측 sidebar에서 보이는 정확한 이름. 예: "다영의 개인", "Personal" 등.
# Google 업무 캘린더는 절대 여기 X — Block 3b spec D1 보안 룰.
JIEUN_CALENDAR_INCLUDE=
```

- [ ] **Step 2: failing test 작성**

`jieun-bot/src/calendar/read.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// child_process.execFile mock — 실제 icalBuddy 호출 안 함
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", async () => {
  const actual = await vi.importActual<typeof import("node:util")>("node:util");
  return {
    ...actual,
    promisify: (fn: unknown) => {
      // execFile mock을 promise 형태로 wrap
      return (cmd: string, args: string[]) => {
        return new Promise((resolve, reject) => {
          (fn as (...a: unknown[]) => void)(cmd, args, (err: Error | null, stdout: string) => {
            if (err) reject(err);
            else resolve({ stdout });
          });
        });
      };
    },
  };
});

vi.mock("../env.js", () => ({
  loadEnv: () => ({ JIEUN_CALENDAR_INCLUDE: "다영의 개인", LOG_DIR: "/tmp" }),
}));

import { execFile } from "node:child_process";
import { fetchEvents } from "./read.js";

const execFileMock = execFile as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  execFileMock.mockReset();
});

describe("calendar/read.ts", () => {
  it("parses single event line", async () => {
    execFileMock.mockImplementation((_cmd, _args, cb) => {
      cb(null, "AAAA-1111|||ABC 회의|||2026-05-04|||15:00|||16:00\n");
    });

    const events = await fetchEvents({ from: "2026-05-04", to: "2026-05-04" });

    expect(events).toEqual([
      {
        uid: "AAAA-1111",
        title: "ABC 회의",
        date: "2026-05-04",
        startTime: "15:00",
        endTime: "16:00",
      },
    ]);
  });

  it("returns empty array on empty output", async () => {
    execFileMock.mockImplementation((_cmd, _args, cb) => cb(null, ""));
    const events = await fetchEvents({ from: "2026-05-04", to: "2026-05-04" });
    expect(events).toEqual([]);
  });

  it("ignores malformed lines without 5 fields", async () => {
    execFileMock.mockImplementation((_cmd, _args, cb) => {
      cb(null, "BAD-LINE\nAAAA|||OK|||2026-05-04|||10:00|||11:00\n");
    });
    const events = await fetchEvents({ from: "2026-05-04", to: "2026-05-04" });
    expect(events).toHaveLength(1);
    expect(events[0]?.uid).toBe("AAAA");
  });

  it("passes -ic <name> for personal calendar isolation", async () => {
    execFileMock.mockImplementation((_cmd, _args, cb) => cb(null, ""));
    await fetchEvents({ from: "2026-05-04", to: "2026-05-04" });
    const args = execFileMock.mock.calls[0]?.[1] as string[];
    expect(args).toContain("-ic");
    const icIdx = args.indexOf("-ic");
    expect(args[icIdx + 1]).toBe("다영의 개인");
  });

  it("rejects when JIEUN_CALENDAR_INCLUDE empty", async () => {
    vi.doMock("../env.js", () => ({
      loadEnv: () => ({ JIEUN_CALENDAR_INCLUDE: "", LOG_DIR: "/tmp" }),
    }));
    const { fetchEvents: fetchEventsEmpty } = await import("./read.js?t=" + Date.now());
    await expect(
      fetchEventsEmpty({ from: "2026-05-04", to: "2026-05-04" })
    ).rejects.toThrow(/JIEUN_CALENDAR_INCLUDE/);
  });

  it("propagates icalBuddy non-zero exit as error", async () => {
    execFileMock.mockImplementation((_cmd, _args, cb) => {
      const err = new Error("Command failed: icalBuddy") as Error & { code?: number };
      err.code = 1;
      cb(err, "");
    });
    await expect(
      fetchEvents({ from: "2026-05-04", to: "2026-05-04" })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: run test — fails ("Cannot find module './read.js'")**

```bash
cd jieun-bot && npm test -- --run src/calendar/read.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: implement `read.ts`**

`jieun-bot/src/calendar/read.ts`:
```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadEnv } from "../env.js";

const execFileP = promisify(execFile);

export type CalendarEvent = {
  uid: string;
  title: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM (24h)
  endTime: string;    // HH:MM
};

export type FetchRange = {
  from: string;  // YYYY-MM-DD inclusive
  to: string;    // YYYY-MM-DD inclusive
};

const SEP = "|||";

/**
 * icalBuddy로 개인 캘린더 일정만 가져온다. Google 업무 캘린더 절대 X.
 *
 * 의존: macOS + icalBuddy 설치 (`brew install ical-buddy`).
 * 권한: TCC "캘린더 전체 접근" 필요 (runbook 절차로 1회 부여).
 */
export async function fetchEvents(range: FetchRange): Promise<CalendarEvent[]> {
  const env = loadEnv();
  if (!env.JIEUN_CALENDAR_INCLUDE) {
    throw new Error("JIEUN_CALENDAR_INCLUDE is empty — set personal calendar name in .env");
  }

  const args = [
    "-nc",                  // calendar name 헤더 X
    "-nrd",                 // relative dates X (절대 날짜)
    "-ea",                  // empty annotations X
    "-b", "",               // bullet X
    "-ic", env.JIEUN_CALENDAR_INCLUDE,
    "-df", "%Y-%m-%d",      // date format
    "-tf", "%H:%M",          // time format
    "-ps", `${SEP}TITLE${SEP}`,   // property separator (사실상 unused — po만 본다)
    "-po", "uid,title,datetime",
    `eventsFrom:${range.from}`,
    `to:${range.to}`,
  ];

  const { stdout } = await execFileP("icalBuddy", args);
  return parseIcalBuddyOutput(stdout);
}

function parseIcalBuddyOutput(stdout: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const fields = line.split(SEP);
    if (fields.length !== 5) continue;
    const [uid, title, date, startTime, endTime] = fields as [string, string, string, string, string];
    if (!uid || !title || !date) continue;
    events.push({ uid, title, date, startTime, endTime });
  }
  return events;
}

/** 노출 (테스트 외엔 직접 사용 X) */
export const __test = { parseIcalBuddyOutput };
```

> **운영 메모**: icalBuddy의 실제 plain-text 출력 포맷이 `-po uid,title,datetime`이 위 가정대로 5필드인지는 Mac mini에서 1회 검증 필요. 실제 출력이 다르면 `parseIcalBuddyOutput`만 조정 — 함수 시그니처는 안 바꿈. 검증은 다음 step.

- [ ] **Step 5: run test — passes**

```bash
cd jieun-bot && npm test -- --run src/calendar/read.test.ts
```
Expected: PASS, 6 tests.

- [ ] **Step 6: Mac mini 라이브 검증 (manual)**

```bash
# Mac mini 다영 GUI 세션 터미널에서:
JIEUN_CALENDAR_INCLUDE="다영의 개인" \
  node -e "
    import('./jieun-bot/dist/calendar/read.js').then(m =>
      m.fetchEvents({from: '2026-05-03', to: '2026-05-10'}).then(console.log)
    )
  "
```
- 첫 호출 시 macOS가 "캘린더에 접근하려고 합니다" 프롬프트 → "허용"
- 출력 형식이 가정과 다르면 `parseIcalBuddyOutput`을 actual output에 맞춰 수정 + test 업데이트

> **첫 manual run에서 권한 프롬프트 안 뜨고 silent fail이면**: launchd 컨텍스트 권한 분리 케이스. Task 3.11에서 `LimitLoadToSessionType=Aqua` 처리. 일단 read만 manual TTY로 검증되면 다음 step.

- [ ] **Step 7: lint + types**

```bash
cd jieun-bot && npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 8: commit**

```bash
cd jieun-bot && git add src/calendar/read.ts src/calendar/read.test.ts src/env.ts .env.example
git -C .. commit -m "$(cat <<'EOF'
feat(jieun-bot): calendar/read — icalBuddy 래퍼 + 개인 캘린더 격리

- JIEUN_CALENDAR_INCLUDE 환경변수 (-ic 화이트리스트, Google 업무 절대 미접근)
- plain-text 출력 ||| 구분자로 5필드 파싱 (uid, title, date, start, end)
- malformed 라인 skip, 빈 결과 [] 반환
- 6 unit tests (mock execFile)
- 라이브 출력 포맷 검증은 Mac mini manual run에서 1회

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.11 — `calendar/write.ts` + AppleScript scripts + TCC 권한 검증 게이트

**Files:**
- Create: `jieun-bot/src/calendar/write.ts`
- Create: `jieun-bot/src/calendar/write.test.ts`
- Create: `jieun-bot/src/calendar/scripts/calendar-add.applescript`
- Create: `jieun-bot/src/calendar/scripts/calendar-delete.applescript`
- Modify: `jieun-bot/package.json` — `dist`에 `.applescript` 포함되도록 build script 보강

**Goal:** osascript로 Apple Calendar 일정 등록/삭제. ISO 시간 → AppleScript date components 분해. 등록 후 event UID 반환. 첫 manual run에서 launchd 컨텍스트 TCC 권한 검증.

**왜 ISO 직접 안 보내고 components 분해?** AppleScript의 `date "..."` 파싱은 시스템 로케일·시간대 의존이라 fragile. Node에서 KST 기준 components(year/month/day/hour/minute) 분해해서 argv로 전달하면 결정적.

- [ ] **Step 1: applescripts 작성**

`jieun-bot/src/calendar/scripts/calendar-add.applescript`:
```applescript
on run argv
	-- argv: title, calendarName, year, month, day, hour, minute, durationMinutes
	if (count of argv) is not 8 then
		error "Usage: title calendar year month day hour minute durationMin"
	end if
	set evTitle to item 1 of argv
	set evCalendar to item 2 of argv
	set theYear to (item 3 of argv) as integer
	set theMonth to (item 4 of argv) as integer
	set theDay to (item 5 of argv) as integer
	set theHour to (item 6 of argv) as integer
	set theMinute to (item 7 of argv) as integer
	set theDuration to (item 8 of argv) as integer

	set startDate to current date
	set year of startDate to theYear
	set month of startDate to theMonth
	set day of startDate to theDay
	set hours of startDate to theHour
	set minutes of startDate to theMinute
	set seconds of startDate to 0

	set endDate to startDate + (theDuration * minutes)

	tell application "Calendar"
		tell calendar evCalendar
			set newEvent to make new event with properties {summary:evTitle, start date:startDate, end date:endDate}
			return uid of newEvent
		end tell
	end tell
end run
```

`jieun-bot/src/calendar/scripts/calendar-delete.applescript`:
```applescript
on run argv
	if (count of argv) is not 2 then
		error "Usage: calendarName eventUid"
	end if
	set evCalendar to item 1 of argv
	set evUid to item 2 of argv

	tell application "Calendar"
		tell calendar evCalendar
			set targetEvents to (every event whose uid is evUid)
			if (count of targetEvents) is 0 then
				error "no event with uid " & evUid
			end if
			repeat with ev in targetEvents
				delete ev
			end repeat
		end tell
	end tell
	return "ok"
end run
```

- [ ] **Step 2: package.json build에 scripts 포함**

기존 `build` 스크립트 옆에 `prebuild` 또는 `postbuild`로 .applescript 복사. 가장 단순:

`jieun-bot/package.json` (scripts 섹션):
```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json && cp -R src/calendar/scripts dist/calendar/",
    "...": "..."
  }
}
```

(기존 build 명령에 `&& cp -R src/calendar/scripts dist/calendar/` 만 append. 다른 옵션은 안 건드림.)

- [ ] **Step 3: failing test 작성**

`jieun-bot/src/calendar/write.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", async () => {
  const actual = await vi.importActual<typeof import("node:util")>("node:util");
  return {
    ...actual,
    promisify: (fn: unknown) => {
      return (cmd: string, args: string[]) => {
        return new Promise((resolve, reject) => {
          (fn as (...a: unknown[]) => void)(cmd, args, (err: Error | null, stdout: string) => {
            if (err) reject(err);
            else resolve({ stdout });
          });
        });
      };
    },
  };
});

vi.mock("../env.js", () => ({
  loadEnv: () => ({ JIEUN_CALENDAR_INCLUDE: "다영의 개인", LOG_DIR: "/tmp" }),
}));

import { execFile } from "node:child_process";
import { addEvent, deleteEvent } from "./write.js";

const execFileMock = execFile as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => execFileMock.mockReset());

describe("calendar/write.ts addEvent", () => {
  it("decomposes ISO start to KST components for argv", async () => {
    execFileMock.mockImplementation((_cmd, _args, cb) => cb(null, "ABC-UID-1234\n"));

    const uid = await addEvent({
      title: "ABC 회의",
      start: "2026-05-04T15:00:00+09:00",
      end: "2026-05-04T16:30:00+09:00",
    });

    expect(uid).toBe("ABC-UID-1234");
    const args = execFileMock.mock.calls[0]?.[1] as string[];
    // osascript <script> title calendar year month day hour min duration
    expect(args[args.length - 8]).toBe("ABC 회의");
    expect(args[args.length - 7]).toBe("다영의 개인");
    expect(args[args.length - 6]).toBe("2026");
    expect(args[args.length - 5]).toBe("5");
    expect(args[args.length - 4]).toBe("4");
    expect(args[args.length - 3]).toBe("15");
    expect(args[args.length - 2]).toBe("0");
    expect(args[args.length - 1]).toBe("90");  // 90 min duration
  });

  it("trims osascript stdout newline", async () => {
    execFileMock.mockImplementation((_cmd, _args, cb) => cb(null, "  UID-X\n  \n"));
    const uid = await addEvent({
      title: "X",
      start: "2026-05-04T15:00:00+09:00",
      end: "2026-05-04T16:00:00+09:00",
    });
    expect(uid).toBe("UID-X");
  });

  it("rejects when osascript fails (TCC permission etc)", async () => {
    execFileMock.mockImplementation((_cmd, _args, cb) => {
      cb(new Error("Not authorized to send Apple events to Calendar."), "");
    });
    await expect(
      addEvent({
        title: "X",
        start: "2026-05-04T15:00:00+09:00",
        end: "2026-05-04T16:00:00+09:00",
      })
    ).rejects.toThrow(/Not authorized/);
  });
});

describe("calendar/write.ts deleteEvent", () => {
  it("invokes delete script with calendar + uid", async () => {
    execFileMock.mockImplementation((_cmd, _args, cb) => cb(null, "ok\n"));
    await deleteEvent("UID-X");
    const args = execFileMock.mock.calls[0]?.[1] as string[];
    expect(args[args.length - 2]).toBe("다영의 개인");
    expect(args[args.length - 1]).toBe("UID-X");
  });

  it("propagates 'no event with uid' error", async () => {
    execFileMock.mockImplementation((_cmd, _args, cb) => {
      cb(new Error("no event with uid X"), "");
    });
    await expect(deleteEvent("X")).rejects.toThrow(/no event with uid/);
  });
});
```

- [ ] **Step 4: run test — fails (module not found)**

```bash
cd jieun-bot && npm test -- --run src/calendar/write.test.ts
```
Expected: FAIL.

- [ ] **Step 5: implement `write.ts`**

`jieun-bot/src/calendar/write.ts`:
```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadEnv } from "../env.js";

const execFileP = promisify(execFile);

const SCRIPT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "scripts");
const ADD_SCRIPT = resolve(SCRIPT_DIR, "calendar-add.applescript");
const DELETE_SCRIPT = resolve(SCRIPT_DIR, "calendar-delete.applescript");

export type AddEventInput = {
  title: string;
  start: string;  // ISO 8601 with KST offset (+09:00)
  end: string;    // ISO 8601 with KST offset
};

/**
 * Apple Calendar에 일정 등록. 권한: TCC "자동화 → Calendar.app".
 * KST 기준 시간 분해 후 AppleScript date components로 전달 — 시간대 결정적.
 */
export async function addEvent(input: AddEventInput): Promise<string> {
  const env = loadEnv();
  if (!env.JIEUN_CALENDAR_INCLUDE) {
    throw new Error("JIEUN_CALENDAR_INCLUDE is empty — set personal calendar name in .env");
  }

  const startKst = decomposeKst(input.start);
  const endKst = decomposeKst(input.end);
  const durationMin = Math.round(
    (Date.parse(input.end) - Date.parse(input.start)) / 60000
  );
  if (durationMin <= 0) throw new Error(`end must be after start (got ${durationMin}min)`);

  const args = [
    ADD_SCRIPT,
    input.title,
    env.JIEUN_CALENDAR_INCLUDE,
    String(startKst.year),
    String(startKst.month),
    String(startKst.day),
    String(startKst.hour),
    String(startKst.minute),
    String(durationMin),
  ];

  const { stdout } = await execFileP("osascript", args);
  const uid = stdout.trim();
  if (!uid) throw new Error("osascript returned empty uid");
  return uid;
}

export async function deleteEvent(uid: string): Promise<void> {
  const env = loadEnv();
  if (!env.JIEUN_CALENDAR_INCLUDE) {
    throw new Error("JIEUN_CALENDAR_INCLUDE is empty");
  }
  await execFileP("osascript", [DELETE_SCRIPT, env.JIEUN_CALENDAR_INCLUDE, uid]);
}

/**
 * ISO 문자열의 KST 시각 components 분해.
 * 입력은 +09:00 offset 가정 — Claude가 항상 KST로 emit (페르소나 prompt에 박힘).
 */
type KstComponents = { year: number; month: number; day: number; hour: number; minute: number };
function decomposeKst(iso: string): KstComponents {
  const d = new Date(iso);
  if (isNaN(d.getTime())) throw new Error(`invalid ISO: ${iso}`);
  // UTC 기준 ms를 +09:00 KST로 시프트해서 분해
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
  };
}

export const __test = { decomposeKst };
```

- [ ] **Step 6: run test — passes**

```bash
cd jieun-bot && npm test -- --run src/calendar/write.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 7: build + Mac mini TCC 검증 게이트 (manual integration)**

```bash
# (1) 다영 GUI 세션 터미널에서 (LaunchAgent와 같은 사용자 컨텍스트)
cd /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot
npm run build

# (2) read 권한 부여 — icalBuddy
JIEUN_CALENDAR_INCLUDE="다영의 개인" icalBuddy eventsToday
# → "icalBuddy가 캘린더에 접근하려고 합니다" 프롬프트 → "허용"

# (3) 자동화 권한 부여 — osascript
osascript -e 'tell application "Calendar" to count of calendars'
# → "Terminal이 Calendar.app 제어하려고 합니다" 프롬프트 → "허용"

# (4) 첫 등록 dry-run — 미래 시각으로 (분 단위로 즉시 알림 안 뜨게)
osascript dist/calendar/scripts/calendar-add.applescript \
  "권한테스트" "다영의 개인" 2026 12 31 23 0 30
# → UID 출력 (예: "C8...-...-...-...")

# (5) 등록 확인 — Calendar.app 열어서 2026-12-31 23:00에 "권한테스트" 보이는지
# (6) 삭제로 정리 — 위 UID 사용
osascript dist/calendar/scripts/calendar-delete.applescript "다영의 개인" "<위_UID>"
# → "ok"

# (7) launchd 컨텍스트 검증 — 봇 reload 후 *봇이 직접* 호출하는 케이스
launchctl unload -w launchd/kr.daniel.jieun.plist
launchctl load -w launchd/kr.daniel.jieun.plist
# → 텔레그램에 "내일 오후 9시 권한테스트2" 발화 → 봇이 propose → "응" → 등록 확인
# (Task 3.13 끝나기 전엔 이 step skip — 등록 흐름이 아직 wire 안 됐으니 Task 3.13 끝에 함께 검증)
```

> **분기**:
> - GUI 터미널에선 OK인데 launchd 컨텍스트에서 "Not authorized" silent fail이면 → `jieun-bot/launchd/kr.daniel.jieun.plist`에 `<key>LimitLoadToSessionType</key><string>Aqua</string>` 추가하고 plist reload. plist 변경 commit 별도.
> - 권한 프롬프트가 안 뜨고 즉시 fail이면 → 시스템 환경설정 → 개인정보보호 → 자동화/캘린더 수동으로 "Terminal" + "node" + "osascript" 항목 추가.

- [ ] **Step 8: lint + types**

```bash
cd jieun-bot && npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 9: commit**

```bash
cd jieun-bot && git add src/calendar/write.ts src/calendar/write.test.ts \
  src/calendar/scripts/calendar-add.applescript src/calendar/scripts/calendar-delete.applescript \
  package.json
git -C .. commit -m "$(cat <<'EOF'
feat(jieun-bot): calendar/write — osascript 래퍼 + applescripts + TCC 검증

- addEvent(title, start, end) → uid (KST components 분해 후 argv 전달)
- deleteEvent(uid) — calendar 화이트리스트 + uid로 매칭 삭제
- ISO 직접 파싱 X — Node에서 KST 시프트 후 year/month/day/hour/min 분해
- 5 unit tests (execFile mock + KST decomposition + 권한 fail propagation)
- build script에 .applescript dist 복사 추가
- TCC 권한 절차 manual integration step에 박음 — runbook은 Task 3.10 마지막에 정리

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### 🟢 Phase 3b-A 체크포인트 (라이브 검증)

다영이 검증할 것:
1. `npm test -- --run src/calendar/` 통과 (11 tests).
2. Mac mini GUI 터미널에서 권한 프롬프트 2개 (캘린더 + 자동화) "허용" 확인.
3. dry-run 등록 → Calendar.app에 2026-12-31 23:00 "권한테스트" 보임 → 삭제 후 사라짐.
4. launchd 컨텍스트 권한 별도 검증은 Task 3.13 끝에 (등록 흐름과 함께).

문제 있으면 stop. 없으면 Phase 3b-B로.

---

## Phase 3b-B — 액션 + 흐름

### Task 3.12 — `pending.ts` + `parse.ts` + `actions.ts` schema 4종 추가

**Files:**
- Create: `jieun-bot/src/calendar/pending.ts`
- Create: `jieun-bot/src/calendar/pending.test.ts`
- Create: `jieun-bot/src/calendar/parse.ts`
- Create: `jieun-bot/src/calendar/parse.test.ts`
- Modify: `jieun-bot/src/claude/actions.ts` — schema 4종 추가
- Modify: `jieun-bot/src/claude/actions.test.ts` — 새 액션 파싱 테스트

**Goal:** in-memory pending Map (LIFO + 5분 expire), Claude payload validation, action schemas 4종 (`propose_calendar_event`, `propose_calendar_delete`, `confirm_calendar_action`, `cancel_calendar_action`).

- [ ] **Step 1: pending.test.ts**

`jieun-bot/src/calendar/pending.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setPending, getPending, clearPending,
  __test as pendingTest,
} from "./pending.js";

beforeEach(() => {
  pendingTest.clearAll();
  vi.useRealTimers();
});

describe("calendar/pending.ts", () => {
  it("set + get returns same record", () => {
    setPending(123, {
      kind: "register",
      title: "ABC",
      start: "2026-05-04T15:00:00+09:00",
      end: "2026-05-04T16:00:00+09:00",
    });
    const p = getPending(123);
    expect(p?.kind).toBe("register");
    if (p?.kind === "register") expect(p.title).toBe("ABC");
  });

  it("LIFO — new set overrides old", () => {
    setPending(1, { kind: "register", title: "A", start: "2026-05-04T10:00:00+09:00", end: "2026-05-04T11:00:00+09:00" });
    setPending(1, { kind: "register", title: "B", start: "2026-05-04T15:00:00+09:00", end: "2026-05-04T16:00:00+09:00" });
    const p = getPending(1);
    if (p?.kind === "register") expect(p.title).toBe("B");
  });

  it("expires after 5 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T14:00:00+09:00"));
    setPending(1, { kind: "register", title: "X", start: "2026-05-04T15:00:00+09:00", end: "2026-05-04T16:00:00+09:00" });

    vi.setSystemTime(new Date("2026-05-03T14:04:00+09:00"));
    expect(getPending(1)).not.toBeNull();

    vi.setSystemTime(new Date("2026-05-03T14:06:00+09:00"));
    expect(getPending(1)).toBeNull();
  });

  it("clearPending removes entry", () => {
    setPending(1, { kind: "register", title: "X", start: "2026-05-04T15:00:00+09:00", end: "2026-05-04T16:00:00+09:00" });
    clearPending(1);
    expect(getPending(1)).toBeNull();
  });

  it("delete kind preserves targetUid + display", () => {
    setPending(1, { kind: "delete", targetUid: "UID-X", display: "내일 15:00 ABC" });
    const p = getPending(1);
    expect(p?.kind).toBe("delete");
    if (p?.kind === "delete") {
      expect(p.targetUid).toBe("UID-X");
      expect(p.display).toBe("내일 15:00 ABC");
    }
  });
});
```

- [ ] **Step 2: run — fails (module not found)**

```bash
cd jieun-bot && npm test -- --run src/calendar/pending.test.ts
```
Expected: FAIL.

- [ ] **Step 3: implement `pending.ts`**

`jieun-bot/src/calendar/pending.ts`:
```ts
const TTL_MS = 5 * 60 * 1000;

export type Pending =
  | { kind: "register"; title: string; start: string; end: string; proposedAt: number }
  | { kind: "delete"; targetUid: string; display: string; proposedAt: number };

export type PendingInput =
  | { kind: "register"; title: string; start: string; end: string }
  | { kind: "delete"; targetUid: string; display: string };

const map = new Map<number, Pending>();

export function setPending(chatId: number, input: PendingInput): void {
  const proposedAt = Date.now();
  if (input.kind === "register") {
    map.set(chatId, { ...input, proposedAt });
  } else {
    map.set(chatId, { ...input, proposedAt });
  }
}

export function getPending(chatId: number): Pending | null {
  const p = map.get(chatId);
  if (!p) return null;
  if (Date.now() - p.proposedAt > TTL_MS) {
    map.delete(chatId);
    return null;
  }
  return p;
}

export function clearPending(chatId: number): void {
  map.delete(chatId);
}

export const __test = {
  clearAll: () => map.clear(),
};
```

- [ ] **Step 4: pending tests pass**

```bash
cd jieun-bot && npm test -- --run src/calendar/pending.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 5: parse.test.ts**

`jieun-bot/src/calendar/parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateProposeEvent } from "./parse.js";

describe("calendar/parse.ts validateProposeEvent", () => {
  it("accepts valid ISO with KST offset", () => {
    const r = validateProposeEvent({
      title: "ABC",
      start: "2026-05-04T15:00:00+09:00",
      end: "2026-05-04T16:00:00+09:00",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects empty title", () => {
    const r = validateProposeEvent({
      title: "",
      start: "2026-05-04T15:00:00+09:00",
      end: "2026-05-04T16:00:00+09:00",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/title/);
  });

  it("rejects end before start", () => {
    const r = validateProposeEvent({
      title: "X",
      start: "2026-05-04T16:00:00+09:00",
      end: "2026-05-04T15:00:00+09:00",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/end/);
  });

  it("rejects too far in past (more than 1 day ago)", () => {
    const oldStart = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    const oldEnd = new Date(Date.now() - 2 * 86400 * 1000 + 3600 * 1000).toISOString();
    const r = validateProposeEvent({ title: "X", start: oldStart, end: oldEnd });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/past/);
  });

  it("rejects too far in future (more than 1 year)", () => {
    const farStart = new Date(Date.now() + 400 * 86400 * 1000).toISOString();
    const farEnd = new Date(Date.now() + 400 * 86400 * 1000 + 3600 * 1000).toISOString();
    const r = validateProposeEvent({ title: "X", start: farStart, end: farEnd });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/future/);
  });

  it("rejects malformed ISO", () => {
    const r = validateProposeEvent({ title: "X", start: "not-a-date", end: "also-bad" });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 6: implement `parse.ts`**

`jieun-bot/src/calendar/parse.ts`:
```ts
export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

const ONE_DAY_MS = 86400 * 1000;
const ONE_YEAR_MS = 365 * ONE_DAY_MS;

/**
 * Claude의 propose_calendar_event payload sanity check.
 * 잘못된 payload는 reject — executor가 다영에게 "어 시간이 이상한데 다시" 응답.
 */
export function validateProposeEvent(p: { title: string; start: string; end: string }): ValidationResult {
  if (!p.title || p.title.trim().length === 0) {
    return { ok: false, reason: "title is empty" };
  }
  const startMs = Date.parse(p.start);
  const endMs = Date.parse(p.end);
  if (isNaN(startMs)) return { ok: false, reason: `start ISO malformed: ${p.start}` };
  if (isNaN(endMs)) return { ok: false, reason: `end ISO malformed: ${p.end}` };
  if (endMs <= startMs) {
    return { ok: false, reason: `end (${p.end}) must be after start (${p.start})` };
  }
  const now = Date.now();
  if (startMs < now - ONE_DAY_MS) {
    return { ok: false, reason: `start too far in past: ${p.start}` };
  }
  if (startMs > now + ONE_YEAR_MS) {
    return { ok: false, reason: `start too far in future: ${p.start}` };
  }
  return { ok: true };
}
```

- [ ] **Step 7: parse tests pass**

```bash
cd jieun-bot && npm test -- --run src/calendar/parse.test.ts
```
Expected: PASS, 6 tests.

- [ ] **Step 8: actions.ts schema 4종 추가**

`jieun-bot/src/claude/actions.ts` — `BudgetInsertSchema` 아래에 추가:
```ts
const ProposeCalendarEventSchema = z.object({
  kind: z.literal("propose_calendar_event"),
  title: z.string().min(1),
  start: z.string().min(1),  // ISO with KST offset (parse.ts에서 검증)
  end: z.string().min(1),
});

const ProposeCalendarDeleteSchema = z.object({
  kind: z.literal("propose_calendar_delete"),
  targetUid: z.string().min(1),
  display: z.string().min(1),  // 다영에게 보여주는 자연어 ("내일 15:00 ABC")
});

const ConfirmCalendarActionSchema = z.object({
  kind: z.literal("confirm_calendar_action"),
});

const CancelCalendarActionSchema = z.object({
  kind: z.literal("cancel_calendar_action"),
});

export const ActionSchema = z.discriminatedUnion("kind", [
  BudgetInsertSchema,
  ProposeCalendarEventSchema,
  ProposeCalendarDeleteSchema,
  ConfirmCalendarActionSchema,
  CancelCalendarActionSchema,
]);
```

- [ ] **Step 9: actions.test.ts에 새 케이스 추가**

`jieun-bot/src/claude/actions.test.ts` 끝에 (기존 테스트 유지):
```ts
describe("calendar action parsing", () => {
  it("parses propose_calendar_event", () => {
    const text = `<actions>[{"kind":"propose_calendar_event","title":"ABC","start":"2026-05-04T15:00:00+09:00","end":"2026-05-04T16:00:00+09:00"}]</actions>`;
    const r = parseActions(text);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]?.kind).toBe("propose_calendar_event");
  });

  it("parses confirm_calendar_action", () => {
    const text = `오케이<actions>[{"kind":"confirm_calendar_action"}]</actions>`;
    const r = parseActions(text);
    expect(r.actions).toHaveLength(1);
    expect(r.cleanText).toBe("오케이");
  });

  it("parses propose_calendar_delete", () => {
    const text = `<actions>[{"kind":"propose_calendar_delete","targetUid":"UID-X","display":"내일 15:00 ABC"}]</actions>`;
    const r = parseActions(text);
    expect(r.actions).toHaveLength(1);
    if (r.actions[0]?.kind === "propose_calendar_delete") {
      expect(r.actions[0].targetUid).toBe("UID-X");
    }
  });

  it("rejects propose_calendar_event with empty title", () => {
    const text = `<actions>[{"kind":"propose_calendar_event","title":"","start":"2026-05-04T15:00:00+09:00","end":"2026-05-04T16:00:00+09:00"}]</actions>`;
    const r = parseActions(text);
    expect(r.actions).toHaveLength(0);  // schema rejects
  });
});
```

- [ ] **Step 10: full test pass**

```bash
cd jieun-bot && npm test -- --run
```
Expected: 모든 기존 + 새 테스트 PASS.

- [ ] **Step 11: lint + types**

```bash
cd jieun-bot && npm run typecheck && npm run lint
```
Expected: PASS — exhaustive `_exhaustive: never` check가 새 kind들에 대해 빨갛게 뜸 (executeActions.ts에서). Task 3.13에서 dispatch 추가하면 사라짐. 이번 task에선 *예상된 빨강* — typecheck는 통과, lint도 통과 (lint는 unused만 체크).

> 만약 typecheck도 fail이면 — `executeActions.ts`의 exhaustive check는 *런타임 분기가 없어도* type narrowing이 가능하면 통과. 현재 `else` 블록의 `const _exhaustive: never = a.kind;`가 새 kinds로 좁혀져 type error 띄움. 임시 우회: `else if (a.kind === "propose_calendar_event" || ...) { /* TODO Task 3.13 */ }` stub. Task 3.13에서 제거.

- [ ] **Step 12: commit**

```bash
cd jieun-bot && git add src/calendar/pending.ts src/calendar/pending.test.ts \
  src/calendar/parse.ts src/calendar/parse.test.ts \
  src/claude/actions.ts src/claude/actions.test.ts
# executeActions.ts stub은 다음 commit (3.13)에서
git -C .. commit -m "$(cat <<'EOF'
feat(jieun-bot): calendar pending + parse + 액션 schema 4종

- pending.ts: in-memory Map<chatId, Pending>, LIFO, 5분 expire
- parse.ts: validateProposeEvent — ISO sanity, end > start, past/future bound
- actions.ts: propose_calendar_event/_delete + confirm/cancel schema 추가
- 11 new unit tests
- executeActions dispatch는 Task 3.13에서 (이번엔 stub branch만)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.13 — executeActions dispatch + persona prompt 캘린더 룰 + router pending wire

**Files:**
- Modify: `jieun-bot/src/claude/executeActions.ts` — 4종 dispatch case
- Modify: `jieun-bot/src/persona/prompt.ts` — 캘린더 액션 룰 추가
- Modify: `jieun-bot/src/triggers/router.ts` — pending Map 컨텍스트 주입
- Modify: `jieun-bot/src/triggers/userMessage.ts` (만약 별도 파일 있으면) — chatId 전달
- Modify: `jieun-bot/src/claude/executeActions.test.ts` — dispatch 검증
- Modify: `jieun-bot/src/persona/prompt.test.ts` — 새 룰 포함

**Goal:** Claude가 emit한 4종 액션을 봇이 실제로 dispatch. pending Map ↔ Claude prompt context 양방향 wire. multi-hit 후보 컨텍스트 주입은 Task 3.14에서 (이번엔 등록 흐름 단방향만).

- [ ] **Step 1: 페르소나 prompt 캘린더 섹션 작성**

`jieun-bot/src/persona/prompt.ts` — `CORE` 끝 (자율 기록 섹션 다음)에 추가:
```ts
const CALENDAR_RULES = `
[캘린더 액션 — user 트리거에서만, 다영의 *명시 발화*에서만]

다영이 *지금 메시지에서* 일정을 명시한 경우만 propose. 메모리(이전 대화)에서 끌어다 propose 금지 — phantom 등록.

[등록 흐름]
다영: "내일 3시 ABC" / "5/4 오후에 미용실"
→ 자연어 응답에 "내일 5/4(월) 15:00 ABC, 등록할까?" 같이 다영의 표현을 *구체적 시각으로 풀어서* 확인 발화.
→ 동시에 <actions>에 propose_calendar_event emit.

   {"kind":"propose_calendar_event","title":"ABC","start":"2026-05-04T15:00:00+09:00","end":"2026-05-04T16:00:00+09:00"}

   - start/end는 KST (+09:00) ISO 8601. [지금]에 박힌 어제/내일·요일 그대로 사용. 자체 계산 X.
   - 끝 시각이 명시 안 됐으면 1시간 default. 다영이 명시했으면 그대로.
   - 시각이 모호 ("오후") 하면 다영에게 시각 한 번 더 물어보고 propose 미루기.

다영: "응" / "ㅇㅇ" / "등록" / "yes"
→ "넣어뒀어" 류 짧은 응답 + <actions>에 confirm_calendar_action emit.

다영: "아냐" / "취소" / "됐어"
→ "그래 안 할게" 류 응답 + <actions>에 cancel_calendar_action emit.

다영: "5시로 바꿔" / 새로운 시각
→ propose_calendar_event 다시 emit (LIFO로 기존 pending 덮음).

[삭제 흐름 — 봇이 등록한 일정만]
다영: "방금 거 취소" / "내일 ABC 빼줘"
→ [현재 컨텍스트]에 박힌 후보(`삭제 후보`)에서 *정확히 1개* 매칭되면 propose_calendar_delete.
   {"kind":"propose_calendar_delete","targetUid":"<uid from context>","display":"내일 15:00 ABC"}
→ 자연어로 "내일 5/4(월) 15:00 ABC, 지울까?" 확인.

후보 0개 (봇이 등록한 게 아님): "그건 내가 등록한 게 아니라서 직접 지워줘" — propose 금지.
후보 2+개: 자연어로 "(1) 15:00 ABC회의 (2) 17:00 ABC 후속, 어떤 거?" — 이번 턴엔 propose 금지.
다영의 다음 턴에서 ("1번") 그 후보로 propose_calendar_delete.

[pending 있을 때 시점]
[현재 컨텍스트]에 "지금 pending: ..." 보이면 다영의 응답이 confirm/cancel/수정 중 하나일 가능성 높음.
- "응"/"네"/"ㅇㅇ" 류 → confirm_calendar_action
- "아냐"/"취소"/"됐어" → cancel_calendar_action
- 다른 시각/제목 → propose_calendar_event 다시 (LIFO)
- 무관한 다른 화제 → 그냥 자연어 응답, action 없음 (pending 5분 후 자동 expire)

[절대 룰]
- 봇 *자율* 일정 제안 X (산책/식사 등 봇 발 시작 일정).
- schedule/event/latent 트리거에서 캘린더 액션 emit 절대 X — user 트리거 only (자율 기록 룰과 동일).
- propose 후 *자율* confirm 호출 X — 다영의 명시 응답 후에만 confirm.
`.trim();
```

`buildSystemPrompt` 안에서 CORE를 출력하는 부분에 CALENDAR_RULES 합치기. 가장 단순한 패턴: CORE에 직접 append 또는 별도 섹션. user 트리거에서만 의미가 있는 거라 *user 트리거에서만* 박는 게 깔끔:

```ts
// buildSystemPrompt 내부 return 배열에 추가
return [
  CORE,
  trigger === "user" ? CALENDAR_RULES : "",  // 추가
  profileSection ? `[다영에 대해 알게 된 것]\n${profileSection}` : "",
  // ... (나머지 그대로)
].filter(Boolean).join("\n\n");
```

- [ ] **Step 2: persona/prompt.test.ts에 검증 추가**

`jieun-bot/src/persona/prompt.test.ts` 끝에:
```ts
describe("calendar rules section", () => {
  const baseInput = {
    now: new Date("2026-05-03T14:00:00+09:00"),
    memorySection: "",
    profileSection: "",
    contextSection: "",
  };

  it("includes calendar rules on user trigger", () => {
    const prompt = buildSystemPrompt({ ...baseInput, trigger: "user" });
    expect(prompt).toContain("propose_calendar_event");
    expect(prompt).toContain("user 트리거에서만");
  });

  it("excludes calendar rules on schedule trigger", () => {
    const prompt = buildSystemPrompt({ ...baseInput, trigger: "schedule", scheduleKind: "morning" });
    expect(prompt).not.toContain("propose_calendar_event");
  });

  it("excludes calendar rules on event/latent trigger", () => {
    const prompt = buildSystemPrompt({ ...baseInput, trigger: "event" });
    expect(prompt).not.toContain("propose_calendar_event");
    const latent = buildSystemPrompt({ ...baseInput, trigger: "latent" });
    expect(latent).not.toContain("propose_calendar_event");
  });
});
```

- [ ] **Step 3: prompt tests pass**

```bash
cd jieun-bot && npm test -- --run src/persona/
```
Expected: PASS (기존 + 3 새 테스트).

- [ ] **Step 4: executeActions dispatch 4종 구현**

`jieun-bot/src/claude/executeActions.ts` — 기존 `if (a.kind === "budget_insert")` 다음에 분기 추가. 전체 함수 교체:

```ts
import { db } from "../db/client.js";
import { recordBotWrite, markBotWriteEdited } from "../db/botWrites.js";
import type { Action } from "./actions.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";
import {
  setPending, getPending, clearPending,
} from "../calendar/pending.js";
import { validateProposeEvent } from "../calendar/parse.js";
import { addEvent, deleteEvent } from "../calendar/write.js";
import { sendToOwner } from "../telegram/send.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

function dateForOffset(offset: number): string {
  const now = new Date();
  const offsetMs = offset * 86400 * 1000;
  const target = new Date(now.getTime() + offsetMs);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(target);
}

export async function executeActions(actions: Action[], chatId: number): Promise<void> {
  for (const a of actions) {
    try {
      if (a.kind === "budget_insert") {
        const date = dateForOffset(a.date_offset);
        const { data, error } = await db()
          .from("budget_entries")
          .insert({
            date, category: a.category, memo: a.memo, amount: a.amount,
            type: a.type, payment_method: "기타",
          })
          .select("id")
          .single();
        if (error) throw error;
        await recordBotWrite({
          targetTable: "budget_entries", targetId: data.id,
          notes: `${a.memo} ${a.amount.toLocaleString()}원 (${a.category}, ${a.type}, ${date})`,
        });
        logger.info("action: budget_insert", { id: data.id });
      } else if (a.kind === "propose_calendar_event") {
        const v = validateProposeEvent({ title: a.title, start: a.start, end: a.end });
        if (!v.ok) {
          logger.warn("propose_calendar_event rejected", { reason: v.reason });
          // 이 시점엔 자연어 응답이 이미 발신됨. silent — 다영이 다시 시도하면 됨.
          continue;
        }
        setPending(chatId, { kind: "register", title: a.title, start: a.start, end: a.end });
        logger.info("calendar pending: register", { title: a.title, start: a.start });
      } else if (a.kind === "propose_calendar_delete") {
        setPending(chatId, { kind: "delete", targetUid: a.targetUid, display: a.display });
        logger.info("calendar pending: delete", { targetUid: a.targetUid });
      } else if (a.kind === "confirm_calendar_action") {
        const p = getPending(chatId);
        if (!p) {
          logger.info("confirm without pending — graceful no-op");
          continue;
        }
        if (p.kind === "register") {
          const uid = await addEvent({ title: p.title, start: p.start, end: p.end });
          await recordBotWrite({
            targetTable: "apple_calendar", targetId: uid,
            notes: `${p.title} (${p.start} ~ ${p.end})`,
          });
          logger.info("calendar registered", { uid, title: p.title });
        } else {
          await deleteEvent(p.targetUid);
          // bot_writes의 해당 row를 user_edited_at = now()로 마킹 (= 삭제됨)
          const { data } = await db()
            .from("bot_writes")
            .select("id")
            .eq("target_table", "apple_calendar")
            .eq("target_id", p.targetUid)
            .is("user_edited_at", null)
            .limit(1);
          if (data && data[0]) await markBotWriteEdited(data[0].id);
          logger.info("calendar deleted", { uid: p.targetUid });
        }
        clearPending(chatId);
      } else if (a.kind === "cancel_calendar_action") {
        clearPending(chatId);
        logger.info("calendar pending: cancelled");
      } else {
        const _exhaustive: never = a;
        logger.warn("unknown action kind", { kind: (a as { kind: string }).kind });
      }
    } catch (err) {
      const errInfo = err instanceof Error
        ? { message: err.message }
        : typeof err === "object" && err !== null
        ? { message: (err as { message?: string }).message ?? "(no message)", code: (err as { code?: string }).code }
        : { raw: String(err) };
      logger.error("action failed", { kind: a.kind, ...errInfo });

      // 캘린더 에러는 다영에게 한 번 안내 (TCC 권한 끊김 등)
      if (a.kind === "confirm_calendar_action") {
        try {
          await sendToOwner(
            "(캘린더 못 건드렸어 — 권한 끊겼나? 시스템 환경설정 → 개인정보보호 → 자동화 한 번 봐줘)",
            "system"
          );
        } catch { /* swallow */ }
      }
    }
  }
}
```

- [ ] **Step 5: router에 chatId 흐름 wire**

`jieun-bot/src/triggers/router.ts` — `runTrigger` 시그니처에 `chatId` 추가 (user 트리거에선 다영 chat_id, 다른 트리거에선 OWNER chat_id):

기존:
```ts
export type TriggerContext = {
  trigger: Exclude<Trigger, "system">;
  scheduleKind?: ScheduleKind;
  userPrompt: string;
  contextSection?: string;
  signalCandidateIds?: string[];
};
```

→ 변경:
```ts
export type TriggerContext = {
  trigger: Exclude<Trigger, "system">;
  scheduleKind?: ScheduleKind;
  userPrompt: string;
  contextSection?: string;
  signalCandidateIds?: string[];
  chatId: number;          // 추가 — pending Map 키
};
```

`runTrigger` 내부 `executeActions(actions)` 호출을 `executeActions(actions, ctx.chatId)`로 변경.

또한 *user 트리거에서 pending이 있으면* prompt 컨텍스트로 알려주기 — 같은 router 안에서:
```ts
// memorySection 로드 직후, contextSection 합성 직전
import { getPending } from "../calendar/pending.js";

let pendingHint = "";
if (ctx.trigger === "user") {
  const p = getPending(ctx.chatId);
  if (p) {
    if (p.kind === "register") {
      pendingHint = `[지금 pending — 등록 제안]
${p.title} ${p.start} ~ ${p.end}
다영의 응답이 confirm/cancel/수정인지 잘 보고 액션 emit.`;
    } else {
      pendingHint = `[지금 pending — 삭제 제안]
${p.display} (uid=${p.targetUid})
다영의 응답이 confirm/cancel인지 잘 보고 액션 emit.`;
    }
  }
}

const combinedContext = [pendingHint, ctx.contextSection ?? ""].filter(Boolean).join("\n\n");
const systemPrompt = buildSystemPrompt({
  trigger: ctx.trigger,
  scheduleKind: ctx.scheduleKind,
  now: new Date(),
  memorySection,
  profileSection,
  contextSection: combinedContext,
});
```

- [ ] **Step 6: schedule/event/latent 호출자에 chatId 박기**

봇 진입 지점에서 OWNER chat id를 가져옴. 기존 패턴이 `loadEnv().TELEGRAM_OWNER_CHAT_ID` 또는 비슷할 것. 

`jieun-bot/src/triggers/schedule.ts` — 모든 `runTrigger(claude, { ... })` 호출에 `chatId: OWNER_CHAT_ID` 추가:
```ts
import { loadEnv } from "../env.js";
const OWNER_CHAT_ID = parseInt(loadEnv().TELEGRAM_OWNER_CHAT_ID, 10);

// 각 cron 안 runTrigger 호출:
runTrigger(claude, {
  trigger: "schedule",
  scheduleKind: "morning",
  chatId: OWNER_CHAT_ID,
  userPrompt: "...",
})
```

`jieun-bot/src/triggers/event.ts`, `latent.ts`도 동일 패턴으로 `chatId` 추가. `userMessage` 핸들러는 텔레그램 메시지의 `msg.chat.id` 그대로 전달.

> 어디서 OWNER chat id 가져오는지 정확한 변수명은 `env.ts`/`telegram/bot.ts` 보면 됨. 기존 whitelist 체크하는 곳이 있을 것.

- [ ] **Step 7: executeActions.test.ts에 dispatch 케이스 추가**

`jieun-bot/src/claude/executeActions.test.ts` 끝:
```ts
import { setPending, getPending, __test as pendingTest } from "../calendar/pending.js";

vi.mock("../calendar/write.js", () => ({
  addEvent: vi.fn().mockResolvedValue("UID-NEW"),
  deleteEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("calendar action dispatch", () => {
  beforeEach(() => {
    pendingTest.clearAll();
    vi.clearAllMocks();
  });

  it("propose_calendar_event sets pending", async () => {
    await executeActions([{
      kind: "propose_calendar_event",
      title: "ABC",
      start: new Date(Date.now() + 3600000).toISOString(),
      end: new Date(Date.now() + 7200000).toISOString(),
    }], 999);
    const p = getPending(999);
    expect(p?.kind).toBe("register");
  });

  it("propose with invalid range silently rejects (graceful)", async () => {
    await executeActions([{
      kind: "propose_calendar_event",
      title: "ABC",
      start: new Date(Date.now() + 7200000).toISOString(),
      end: new Date(Date.now() + 3600000).toISOString(),  // end before start
    }], 999);
    expect(getPending(999)).toBeNull();
  });

  it("confirm without pending is no-op", async () => {
    await executeActions([{ kind: "confirm_calendar_action" }], 999);
    // no throw, no DB write — test passes if it reaches here
  });

  it("confirm with register pending calls addEvent + records bot_write", async () => {
    setPending(999, {
      kind: "register",
      title: "ABC",
      start: new Date(Date.now() + 3600000).toISOString(),
      end: new Date(Date.now() + 7200000).toISOString(),
    });
    await executeActions([{ kind: "confirm_calendar_action" }], 999);
    expect(getPending(999)).toBeNull();
    // addEvent mock 호출 검증은 dispatched 자체로 확인됨 (no throw)
  });

  it("cancel clears pending", async () => {
    setPending(999, {
      kind: "register",
      title: "X",
      start: new Date(Date.now() + 3600000).toISOString(),
      end: new Date(Date.now() + 7200000).toISOString(),
    });
    await executeActions([{ kind: "cancel_calendar_action" }], 999);
    expect(getPending(999)).toBeNull();
  });
});
```

(기존 budget_insert 테스트의 `executeActions(actions)` 호출에도 두 번째 인자 `999` 추가.)

- [ ] **Step 8: full test pass**

```bash
cd jieun-bot && npm test -- --run
```
Expected: 모든 테스트 PASS.

- [ ] **Step 9: typecheck + lint**

```bash
cd jieun-bot && npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 10: launchd 라이브 검증 (manual)**

```bash
cd /Users/daniel_home/daniel-personal-app/.claude/worktrees/blissful-gates-fa9b73/jieun-bot
npm run build
launchctl unload -w launchd/kr.daniel.jieun.plist
launchctl load -w launchd/kr.daniel.jieun.plist
tail -f logs/bot.log &
```

다영이 텔레그램으로:
1. "내일 오후 9시 봇테스트" → 봇이 자연어 확인 발화 (예: "내일 5/4(월) 21:00 봇테스트, 등록할까?") + log에 `calendar pending: register`
2. "응" → 봇 "넣어뒀어" + log에 `calendar registered { uid: ... }` + Calendar.app에 일정 보임
3. Mac mini Calendar.app에서 일정 확인

> launchd 컨텍스트 권한 fail이면 (Task 3.11 step 7 분기) plist에 `LimitLoadToSessionType=Aqua` 추가 후 재시도.

- [ ] **Step 11: commit**

```bash
cd jieun-bot && git add src/claude/executeActions.ts src/claude/executeActions.test.ts \
  src/persona/prompt.ts src/persona/prompt.test.ts \
  src/triggers/router.ts src/triggers/schedule.ts src/triggers/event.ts src/triggers/latent.ts
git -C .. commit -m "$(cat <<'EOF'
feat(jieun-bot): 캘린더 액션 4종 dispatch + persona prompt 룰 + pending wire

- executeActions: propose/confirm/cancel 4종 분기, addEvent/deleteEvent 호출, bot_writes 기록
- persona prompt: CALENDAR_RULES (user 트리거 only, 자율 기록 룰과 평행)
- router: pending Map ↔ Claude system prompt 양방향 wire
- schedule/event/latent: chatId OWNER 박음 (트리거 컨텍스트 일관)
- executor 5 dispatch tests + persona 3 trigger separation tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.14 — bot_writes 매개 삭제 흐름 + multi-hit prompt 컨텍스트

**Files:**
- Create: `jieun-bot/src/calendar/findTargets.ts`
- Create: `jieun-bot/src/calendar/findTargets.test.ts`
- Modify: `jieun-bot/src/triggers/router.ts` — user 트리거 시 삭제 후보 컨텍스트 주입
- Modify: `jieun-bot/src/persona/prompt.ts` (마이너 — 후보 컨텍스트 형식 명시)

**Goal:** 다영이 "방금 거 취소" / "내일 ABC 빼줘" 같은 *삭제 의도* 발화 시, 봇이 bot_writes에서 매칭 후보 1~3개 추출 → user 트리거 contextSection에 박음 → Claude가 propose_calendar_delete의 targetUid를 그 후보에서 선택. 0개면 "내가 등록한 게 아냐" 응답, 2+개면 다영에게 "어떤 거?" 물음.

**왜 매번 후보 주입?** Claude는 매 user 트리거 새 호출이라 stateful한 candidate list 못 가짐. *지금 이 발화가 삭제 의도인지*는 Claude가 판단하고, 후보 list는 컨텍스트에 미리 박는 게 안전. *발화 의도 모를 땐 컨텍스트 무시* 패턴.

매번 router에서 bot_writes 조회 한 번 — 다영 1인이라 row 적음 (하루 0~3건). 무겁지 않음.

- [ ] **Step 1: findTargets.test.ts**

`jieun-bot/src/calendar/findTargets.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
vi.mock("../db/client.js", () => ({
  db: () => ({
    from: () => ({
      select: () => ({
        eq: (col: string, val: unknown) => ({
          is: (col2: string, val2: unknown) => ({
            order: () => ({
              limit: () => mockSelect(col, val, col2, val2),
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { findDeletionCandidates } from "./findTargets.js";

beforeEach(() => mockSelect.mockReset());

describe("findDeletionCandidates", () => {
  it("returns recent unedited apple_calendar bot_writes", async () => {
    mockSelect.mockResolvedValue({
      data: [
        { id: "w1", target_id: "UID-1", written_at: "2026-05-03T14:00:00Z", notes: "ABC 회의 (...)" },
        { id: "w2", target_id: "UID-2", written_at: "2026-05-03T13:00:00Z", notes: "병원 예약 (...)" },
      ],
      error: null,
    });
    const c = await findDeletionCandidates();
    expect(c).toHaveLength(2);
    expect(c[0]?.targetUid).toBe("UID-1");
    expect(c[0]?.display).toContain("ABC");
  });

  it("returns empty when no unedited writes", async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });
    const c = await findDeletionCandidates();
    expect(c).toEqual([]);
  });

  it("propagates DB error", async () => {
    mockSelect.mockResolvedValue({ data: null, error: new Error("db fail") });
    await expect(findDeletionCandidates()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: implement findTargets.ts**

`jieun-bot/src/calendar/findTargets.ts`:
```ts
import { db } from "../db/client.js";

export type DeletionCandidate = {
  targetUid: string;
  display: string;     // notes 그대로 — Claude가 다영에게 보여줄 때 사용
  writtenAt: string;
};

const MAX_CANDIDATES = 5;

/**
 * 봇이 등록한 + 아직 다영이 안 지운 (또는 봇이 안 지운) 일정 목록.
 * 최근 14일 안 + user_edited_at IS NULL.
 *
 * Claude가 user 트리거 시 contextSection으로 받음 — 삭제 발화면 여기서 매칭.
 */
export async function findDeletionCandidates(): Promise<DeletionCandidate[]> {
  const since = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
  const { data, error } = await db()
    .from("bot_writes")
    .select("id, target_id, written_at, notes")
    .eq("target_table", "apple_calendar")
    .is("user_edited_at", null)
    .gte("written_at", since)
    .order("written_at", { ascending: false })
    .limit(MAX_CANDIDATES);
  if (error) throw error;
  return (data ?? []).map((r: { target_id: string; notes: string | null; written_at: string }) => ({
    targetUid: r.target_id,
    display: r.notes ?? "(메모 없음)",
    writtenAt: r.written_at,
  }));
}
```

> **DB 모킹 노트**: 위 테스트의 mock chain (`from→select→eq→is→order→limit`)이 실제 supabase-js 호출 체인과 일치해야 함. 만약 첫 run에서 chain mismatch면 mock 구조를 실제 호출 순서에 맞춤 (`gte`도 chain에 있음 — 위 mock은 `gte`를 빼먹음, 실제 코드는 `gte` 사용. 테스트 mock에 `gte` 추가 필요):

테스트 mock 수정 — `eq` 다음 chain:
```ts
const mockSelect = vi.fn();
vi.mock("../db/client.js", () => ({
  db: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            gte: () => ({
              order: () => ({
                limit: () => mockSelect(),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));
```

(test 위 코드도 위 chain 그대로 변경.)

- [ ] **Step 3: tests pass**

```bash
cd jieun-bot && npm test -- --run src/calendar/findTargets.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 4: router에 후보 컨텍스트 주입**

`jieun-bot/src/triggers/router.ts` — user 트리거 시 *pending hint*와 *삭제 후보*를 함께 contextSection에 박음:

```ts
import { findDeletionCandidates } from "../calendar/findTargets.js";

// pendingHint 빌드 직후, combinedContext 합성 전에 추가:
let candidatesHint = "";
if (ctx.trigger === "user") {
  try {
    const candidates = await findDeletionCandidates();
    if (candidates.length > 0) {
      const lines = candidates
        .map((c, i) => `${i + 1}. uid=${c.targetUid} — ${c.display} (등록 ${c.writtenAt})`)
        .join("\n");
      candidatesHint = `[삭제 후보 — 봇이 등록한 일정]
${lines}

다영의 발화가 삭제 의도면 위 후보 중 *정확히 1개*에 매칭되는 경우 propose_calendar_delete.
0개 매칭이면 "내가 등록한 게 아니라서 직접 지워줘" 응답.
2+개 모호하면 자연어로 "(1) ... (2) ... 어떤 거?" — 그 턴엔 propose 금지.`;
    }
  } catch (err) {
    logger.warn("findDeletionCandidates failed", { err: String(err) });
    // 후보 없어도 흐름은 계속
  }
}

const combinedContext = [pendingHint, candidatesHint, ctx.contextSection ?? ""]
  .filter(Boolean)
  .join("\n\n");
```

- [ ] **Step 5: 라이브 검증 (manual)**

```bash
cd jieun-bot && npm run build
launchctl unload -w launchd/kr.daniel.jieun.plist && \
  launchctl load -w launchd/kr.daniel.jieun.plist
```

다영이 텔레그램으로 (Task 3.13 step 10에서 등록한 일정이 살아있다면):
1. "방금 봇테스트 빼줘" → 봇이 "내일 5/4(월) 21:00 봇테스트, 지울까?"
2. "응" → 봇 "지웠어" + Calendar.app에서 사라짐 + bot_writes의 해당 row `user_edited_at` 채워짐

다영이 등록 X 케이스:
3. (다영이 폰 캘린더 앱에서 직접 만든 일정 발화) "내일 친구 만남 빼줘" → 봇 "그건 내가 등록한 게 아니라서 직접 지워줘" — 캘린더에 손 안 댐

Multi-hit 케이스 (봇이 같은 시간대 두 일정 등록한 적 있을 때):
4. 봇이 "(1) ... (2) ... 어떤 거?" → 다영 "1번" → 다음 턴 봇이 propose_calendar_delete 첫 후보로

- [ ] **Step 6: typecheck + lint**

```bash
cd jieun-bot && npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 7: commit**

```bash
cd jieun-bot && git add src/calendar/findTargets.ts src/calendar/findTargets.test.ts \
  src/triggers/router.ts
git -C .. commit -m "$(cat <<'EOF'
feat(jieun-bot): 캘린더 삭제 후보 컨텍스트 주입 + multi-hit 흐름

- findTargets: 14일 안 + 안 지운 apple_calendar bot_writes 최대 5개
- router user 트리거: pending hint + 삭제 후보 컨텍스트 주입
- 봇이 등록한 일정만 삭제 가능 (spec D4) — 다영 수동 일정 안전
- 0/1/2+ 매칭 분기는 persona prompt가 처리, 봇 코드는 후보만 박음
- 3 unit tests + 라이브 검증 완료

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### 🟢 Phase 3b-B 체크포인트 (라이브 검증)

다영이 검증할 것:
1. "내일 X시 Y" → 확인 → "응" → 등록 + `bot_writes`에 `target_table='apple_calendar'` row.
2. "5시로 바꿔" → 새 propose (LIFO). 5분 안에 응답 안 하면 silent expire.
3. "방금 거 취소" → 등록한 일정 매칭 → 확인 → "응" → 삭제 + Calendar.app 반영.
4. "내일 친구 만남 빼줘" (봇 등록 X) → "직접 지워줘" 응답, 캘린더 손 안 댐.
5. `/bot-log`에 apple_calendar row 보임. 다영이 거기서 row 직접 지워도 봇이 다음 발화에서 미혼란.

문제 있으면 stop. 없으면 Phase 3b-C로.

---

## Phase 3b-C — 사용처 통합 + 운영

### Task 3.10 — 캘린더 컨텍스트 주입 (브리핑 + 잠재관찰) + runbook 마무리

**Files:**
- Create: `jieun-bot/src/calendar/context.ts`
- Create: `jieun-bot/src/calendar/context.test.ts`
- Modify: `jieun-bot/src/triggers/schedule.ts` — morning/evening_brief 트리거에 contextSection 주입
- Modify: `jieun-bot/src/triggers/latent.ts` — 잠재 관찰 컨텍스트에 캘린더 추가
- Modify: `docs/operations/jieun-runbook.md` — 캘린더 권한 셋업 + 트러블슈팅 섹션 추가

**Goal:** 아침 08:00 / 퇴근직전 20:30 / 잠재 관찰 트리거에 캘린더 컨텍스트 텍스트 주입. Claude가 그 일정 보고 *맥락 있는 한마디*로 풀어냄. runbook에 1회 setup + reset 감지 절차 박아 v1 마무리.

- [ ] **Step 1: context.test.ts**

`jieun-bot/src/calendar/context.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.mock("./read.js", () => ({
  fetchEvents: (range: unknown) => mockFetch(range),
}));

const mockBotWrites = vi.fn();
vi.mock("../db/client.js", () => ({
  db: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () => ({ limit: () => mockBotWrites() }),
          }),
        }),
      }),
    }),
  }),
}));

import { briefingForToday, briefingForTomorrow, latentSnapshot } from "./context.js";

beforeEach(() => {
  mockFetch.mockReset();
  mockBotWrites.mockReset();
  mockBotWrites.mockResolvedValue({ data: [], error: null });
});

describe("calendar/context.ts", () => {
  it("briefingForToday with no events returns empty string", async () => {
    mockFetch.mockResolvedValue([]);
    const txt = await briefingForToday(new Date("2026-05-03T08:00:00+09:00"));
    expect(txt).toBe("");
  });

  it("briefingForToday formats events as bullet list", async () => {
    mockFetch.mockResolvedValue([
      { uid: "U1", title: "ABC 회의", date: "2026-05-03", startTime: "15:00", endTime: "16:00" },
      { uid: "U2", title: "운동", date: "2026-05-03", startTime: "19:00", endTime: "20:00" },
    ]);
    const txt = await briefingForToday(new Date("2026-05-03T08:00:00+09:00"));
    expect(txt).toContain("[오늘 캘린더]");
    expect(txt).toContain("15:00–16:00 ABC 회의");
    expect(txt).toContain("19:00–20:00 운동");
  });

  it("marks events registered by bot with (봇 등록) suffix", async () => {
    mockFetch.mockResolvedValue([
      { uid: "U-BOT", title: "ABC", date: "2026-05-03", startTime: "15:00", endTime: "16:00" },
      { uid: "U-MANUAL", title: "친구", date: "2026-05-03", startTime: "19:00", endTime: "20:00" },
    ]);
    mockBotWrites.mockResolvedValue({ data: [{ target_id: "U-BOT" }], error: null });
    const txt = await briefingForToday(new Date("2026-05-03T08:00:00+09:00"));
    expect(txt).toMatch(/ABC.*\(봇 등록\)/);
    expect(txt).not.toMatch(/친구.*\(봇 등록\)/);
  });

  it("briefingForTomorrow uses tomorrow's date", async () => {
    mockFetch.mockResolvedValue([]);
    await briefingForTomorrow(new Date("2026-05-03T20:30:00+09:00"));
    const arg = mockFetch.mock.calls[0]?.[0] as { from: string; to: string };
    expect(arg.from).toBe("2026-05-04");
    expect(arg.to).toBe("2026-05-04");
  });

  it("latentSnapshot includes today + yesterday", async () => {
    mockFetch.mockResolvedValue([]);
    await latentSnapshot(new Date("2026-05-03T15:00:00+09:00"));
    const arg = mockFetch.mock.calls[0]?.[0] as { from: string; to: string };
    expect(arg.from).toBe("2026-05-02");
    expect(arg.to).toBe("2026-05-03");
  });
});
```

- [ ] **Step 2: implement context.ts**

`jieun-bot/src/calendar/context.ts`:
```ts
import { fetchEvents, type CalendarEvent } from "./read.js";
import { db } from "../db/client.js";

function kstDate(date: Date, offsetDays: number = 0): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const shifted = new Date(date.getTime() + offsetDays * 86400 * 1000);
  return fmt.format(shifted);
}

async function fetchBotRegisteredUids(sinceDays: number): Promise<Set<string>> {
  const since = new Date(Date.now() - sinceDays * 86400 * 1000).toISOString();
  const { data, error } = await db()
    .from("bot_writes")
    .select("target_id")
    .eq("target_table", "apple_calendar")
    .gte("written_at", since)
    .order("written_at", { ascending: false })
    .limit(50);
  if (error || !data) return new Set();
  return new Set(data.map((r: { target_id: string }) => r.target_id));
}

function formatEvents(label: string, events: CalendarEvent[], botUids: Set<string>): string {
  if (events.length === 0) return "";
  const lines = events.map((e) => {
    const range = `${e.startTime}–${e.endTime}`;
    const tag = botUids.has(e.uid) ? " (봇 등록)" : "";
    return `- ${range} ${e.title}${tag}`;
  });
  return `[${label}]\n${lines.join("\n")}`;
}

export async function briefingForToday(now: Date): Promise<string> {
  const today = kstDate(now);
  const events = await fetchEvents({ from: today, to: today });
  const botUids = await fetchBotRegisteredUids(30);
  return formatEvents("오늘 캘린더", events, botUids);
}

export async function briefingForTomorrow(now: Date): Promise<string> {
  const tomorrow = kstDate(now, 1);
  const events = await fetchEvents({ from: tomorrow, to: tomorrow });
  const botUids = await fetchBotRegisteredUids(30);
  return formatEvents("내일 캘린더", events, botUids);
}

export async function latentSnapshot(now: Date): Promise<string> {
  const today = kstDate(now);
  const yesterday = kstDate(now, -1);
  const events = await fetchEvents({ from: yesterday, to: today });
  const botUids = await fetchBotRegisteredUids(30);
  if (events.length === 0) return "";
  return formatEvents("최근 캘린더 (어제~오늘)", events, botUids);
}
```

- [ ] **Step 3: context tests pass**

```bash
cd jieun-bot && npm test -- --run src/calendar/context.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 4: schedule.ts wire**

`jieun-bot/src/triggers/schedule.ts` — morning + evening_brief에 contextSection 주입. *cron 콜백을 async로 변경* + try/catch:

morning 변경:
```ts
cron.schedule(
  "0 8 * * *",
  async () => {
    let calendarSection = "";
    try {
      calendarSection = await briefingForToday(new Date());
    } catch (err) {
      logger.warn("calendar briefing failed (morning)", { err: String(err) });
    }
    runTrigger(claude, {
      trigger: "schedule",
      scheduleKind: "morning",
      chatId: OWNER_CHAT_ID,
      contextSection: calendarSection,
      userPrompt:
        "지금은 아침 08:00. 다영의 하루 시작 전. " +
        "[현재 컨텍스트]에 오늘 캘린더가 박혀 있으면 *맥락 있는 한마디*로 풀어 (예: '오후 3시 ABC 있네 — 점심 미리 챙겨'). " +
        "일정 없으면 가벼운 인사 또는 어제 환기. 짧게. 침묵 OK.",
    }).catch((err) => logger.error("morning brief failed", { err: String(err) }));
  },
  { timezone: "Asia/Seoul" }
);
```

evening_brief 변경:
```ts
cron.schedule(
  "30 20 * * *",
  async () => {
    let calendarSection = "";
    try {
      calendarSection = await briefingForTomorrow(new Date());
    } catch (err) {
      logger.warn("calendar briefing failed (evening)", { err: String(err) });
    }
    runTrigger(claude, {
      trigger: "schedule",
      scheduleKind: "evening_brief",
      chatId: OWNER_CHAT_ID,
      contextSection: calendarSection,
      userPrompt:
        "지금은 20:30. 다영의 퇴근 직전. " +
        "[현재 컨텍스트]에 내일 캘린더가 있으면 가볍게 짚어 (예: '내일 1시 회의 있네'). " +
        "없으면 가벼운 안부. 침묵 OK.",
    }).catch((err) => logger.error("evening brief failed", { err: String(err) }));
  },
  { timezone: "Asia/Seoul" }
);
```

import 추가:
```ts
import { briefingForToday, briefingForTomorrow } from "../calendar/context.js";
```

- [ ] **Step 5: latent.ts wire**

`jieun-bot/src/triggers/latent.ts` 안 — 컨텍스트 빌딩 시 `latentSnapshot` 결과 한 줄 추가. 정확한 위치는 기존 코드 보고 결정 — `runLatentObservation`에서 `runTrigger` 호출 직전에:

```ts
import { latentSnapshot } from "../calendar/context.js";

// 기존 컨텍스트 빌드 직후 (signal candidates 등이 합쳐지는 곳):
let calendarHint = "";
try {
  calendarHint = await latentSnapshot(new Date());
} catch (err) {
  logger.warn("latent calendar snapshot failed", { err: String(err) });
}

const combinedContext = [existingContext, calendarHint].filter(Boolean).join("\n\n");
// runTrigger에 contextSection: combinedContext 전달
```

(기존 latent.ts의 정확한 변수명 / 위치는 그 파일 보고 맞춤 — pattern은 동일.)

- [ ] **Step 6: 라이브 검증 (manual)**

```bash
cd jieun-bot && npm run build
launchctl unload -w launchd/kr.daniel.jieun.plist && \
  launchctl load -w launchd/kr.daniel.jieun.plist
```

다영이 검증:
1. 폰 캘린더에 내일 일정 1~2개 (예: 15:00 회의, 19:00 운동) 직접 등록 — 봇 등록 X 일정.
2. 다음날 08:00 브리핑이 일정을 *맥락 있게* 짚는지 ("오늘 회의 1개 있네, 점심 미리"). 일정 0개면 일반 인사.
3. 같은 날 20:30 브리핑은 *내일* 일정 (없으면 가벼운 안부).
4. 잠재 관찰 슬롯 (10:00 / 15:00 / 19:30) 시 캘린더가 컨텍스트에 들어가서 봇이 *맥락 있는* 발화 가능.

- [ ] **Step 7: runbook 업데이트**

`docs/operations/jieun-runbook.md`에 신규 섹션 추가 (기존 구조 보고 자연스러운 위치 찾기 — Block 4 마지막 task에서 한 패턴):

```markdown
## 캘린더 (Block 3b)

### 첫 배포 1회 setup

**환경변수**:
1. Mac mini Calendar.app 열어서 좌측 sidebar의 *개인 캘린더* 정확한 이름 확인 (예: "다영의 개인", "Personal").
2. `jieun-bot/.env`에 추가:
   ```
   JIEUN_CALENDAR_INCLUDE=다영의 개인
   ```
   (Google 업무 캘린더 절대 X — Block 3b spec D1 보안 룰.)

**TCC 권한** (다영 GUI 세션 터미널에서):
1. `icalBuddy eventsToday` → "캘린더에 접근하려고 합니다" 프롬프트 → "허용"
2. `osascript -e 'tell application "Calendar" to count of calendars'` → "Terminal이 Calendar.app을 제어하려고 합니다" → "허용"
3. 봇 reload: `launchctl unload -w launchd/kr.daniel.jieun.plist && launchctl load -w launchd/kr.daniel.jieun.plist`
4. 텔레그램에 `내일 오후 9시 권한테스트 등록해줘` 발화 → 확인 발화 → "응" → Calendar.app에 일정 보이면 OK.

**launchd 컨텍스트에서 권한 못 받는 경우** (osascript silent fail):
- `launchd/kr.daniel.jieun.plist`에 추가:
  ```xml
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  ```
- 다시 reload. GUI 세션의 권한이 상속되어야 함.

### 권한 reset 감지 (운영 중)

봇이 `osascript`/`icalBuddy`를 권한 부족으로 fail하면 텔레그램에 1회 안내 (`(캘린더 못 건드렸어 — 권한 끊겼나?)`). 이후 auto-backoff(연속 발화 3회) silent.

수동 복구:
1. Mac mini에서 시스템 환경설정 → 개인정보보호 → 자동화 또는 캘린더 항목 확인.
2. Terminal / osascript / icalBuddy 항목 토글 "허용".
3. 봇 reload.
4. 텔레그램 `테스트` 발화로 검증.

### 트러블슈팅

| 증상 | 원인 가능성 | 처리 |
|---|---|---|
| 봇이 propose 후 confirm 했는데 일정 안 뜸 | TCC 권한 reset | 위 *수동 복구* |
| 등록 일정의 시간이 1시간 어긋남 | Mac mini 시스템 시간대가 KST 아님 | `sudo systemsetup -settimezone Asia/Seoul` |
| 잘못된 일정이 등록됨 | Claude 자연어 파싱 오류 | 다영이 *확인 단계*에서 "아냐" → drop. 패턴 누적되면 페르소나 prompt 보강 |
| `/bot-log`에 apple_calendar row가 안 보임 | bot_writes write 실패 | 로그 확인 (`tail logs/bot.log`) |
```

- [ ] **Step 8: typecheck + lint + 전체 테스트**

```bash
cd jieun-bot && npm test -- --run && npm run typecheck && npm run lint
```
Expected: 모두 PASS.

- [ ] **Step 9: commit**

```bash
cd jieun-bot && git add src/calendar/context.ts src/calendar/context.test.ts \
  src/triggers/schedule.ts src/triggers/latent.ts
cd .. && git add docs/operations/jieun-runbook.md
git commit -m "$(cat <<'EOF'
feat(jieun-bot): 캘린더 컨텍스트 주입 (브리핑/잠재관찰) + runbook 마무리

- context.ts: briefingForToday/Tomorrow + latentSnapshot
- 봇 등록 일정 (봇 등록) 라벨 — 다영이 회고 시 자기 입력 vs 봇 입력 구분
- schedule 08:00/20:30 트리거에 캘린더 contextSection 주입
- latent 슬롯에 today+yesterday 스냅샷 주입
- runbook: TCC 권한 1회 setup + launchd 컨텍스트 처리 + reset 트러블슈팅

Block 3b 완료 — v1+ 마지막 placeholder 닫힘.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### 🟢 Phase 3b-C 체크포인트 (= Block 3b 완료)

다영이 검증할 것 (1~2일 운영):
1. 08:00 아침 브리핑이 오늘 일정 보고 *맥락 한마디* — 일정 0개일 땐 일반 인사로 자연스럽게 분기.
2. 20:30 퇴근직전 브리핑이 내일 일정 보고 한마디.
3. 잠재 관찰 슬롯 (10:00 / 15:00 / 19:30) 발화에 캘린더 흐름이 자연스럽게 녹아듦.
4. 등록 흐름 — 자연어 → 확인 → 응 → 등록. 5분 expire silent.
5. 삭제 흐름 — 매칭 0/1/2+ 분기 자연스러움.
6. `/bot-log`에 apple_calendar row 보이고, 다영이 거기서 직접 지우면 다음 발화에서 봇이 미혼란 (user_edited_at 채워짐).
7. TCC 권한 한 번 끊겼다 다시 부여하는 시뮬 (시스템 환경설정에서 toggle 후 다시 허용) — 봇 graceful 안내 후 복구.

---

## 결정 / 미해결 사항 (운영 중 추적)

본 plan에서 결정한 spec 미해결:
- **launchd 컨텍스트 권한 상속**: Task 3.11 step 7 분기로 처리. plist `LimitLoadToSessionType=Aqua` 또는 다영 수동 추가.
- **icalBuddy 출력 포맷**: Task 3.9 step 6에서 1회 검증. 다르면 `parseIcalBuddyOutput`만 조정.
- **자연어 파싱 정확도**: 운영 1~2주 후 followup. 다영이 *확인 단계*에서 "아냐"로 drop하는 패턴 누적되면 페르소나 prompt 보강.

남은 followup (HANDOFF.md 큐):
- **5분 expire 적당한가**: 자다 깨서 옛날 제안 응답 케이스 — 운영 보고 조정.
- **multi-hit 처리 톤**: "(1)(2)" 응답이 페르소나(친구 카톡)에 맞는지 — 다영 reaction 보고 자연어 다듬기.
- **반복 일정 / 등록 후 update**: v2 후보.
