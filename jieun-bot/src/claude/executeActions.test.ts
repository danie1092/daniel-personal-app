import { describe, it, expect, vi, beforeEach } from "vitest";

// env mock — loadEnv는 logger 초기화 시 호출됨
vi.mock("../env.js", () => ({
  loadEnv: () => ({
    LOG_DIR: "/tmp",
    JIEUN_CALENDAR_INCLUDE: "다영의 개인",
    SUPABASE_URL: "http://test",
    SUPABASE_SERVICE_ROLE_KEY: "test-key",
    TELEGRAM_OWNER_CHAT_ID: 12345,
  }),
}));

// db mock — chainable .from().select().eq()... 체인.
// confirm_calendar_action(delete) 경로 커버.
const deleteSelectChain = vi.fn();
const dbFromMock = vi.fn();
const upsertMock = vi.fn();
const insertMock = vi.fn();
const updateChainEqMock = vi.fn();

vi.mock("../db/client.js", () => ({
  db: () => ({
    from: dbFromMock,
  }),
}));

// recordBotWrite/markBotWriteEdited mock — 실제 supabase touch 회피
const recordBotWriteMock = vi.fn().mockResolvedValue("BW-1");
const markBotWriteEditedMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../db/botWrites.js", () => ({
  recordBotWrite: (...args: unknown[]) => recordBotWriteMock(...args),
  markBotWriteEdited: (...args: unknown[]) => markBotWriteEditedMock(...args),
}));

// calendar/write mock — addEvent/deleteEvent
const addEventMock = vi.fn().mockResolvedValue("UID-NEW");
const deleteEventMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../calendar/write.js", () => ({
  addEvent: (...args: unknown[]) => addEventMock(...args),
  deleteEvent: (...args: unknown[]) => deleteEventMock(...args),
}));

// telegram/send mock — sendToOwner (confirm 실패 시 호출됨)
const sendToOwnerMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../telegram/send.js", () => ({
  sendToOwner: (...args: unknown[]) => sendToOwnerMock(...args),
}));

import { executeActions } from "./executeActions.js";
import { setPending, getPending, __test as pendingTest } from "../calendar/pending.js";
import {
  setRoutinePending,
  getRoutinePending,
  __test as routinePendingTest,
} from "../routine/pending.js";

beforeEach(() => {
  deleteSelectChain.mockReset();
  dbFromMock.mockReset();
  upsertMock.mockReset();
  insertMock.mockReset();
  updateChainEqMock.mockReset();
  recordBotWriteMock.mockClear();
  markBotWriteEditedMock.mockClear();
  addEventMock.mockClear();
  deleteEventMock.mockClear();
  sendToOwnerMock.mockClear();
  pendingTest.clearAll();
  routinePendingTest.clearAll();

  upsertMock.mockResolvedValue({ error: null });
  insertMock.mockResolvedValue({ error: null });
  updateChainEqMock.mockResolvedValue({ error: null });

  dbFromMock.mockImplementation((table: string) => {
    if (table === "bot_writes") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                limit: deleteSelectChain,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "routine_checks" || table === "daily_log") {
      return { upsert: upsertMock };
    }
    if (table === "routine_items") {
      return {
        insert: insertMock,
        update: () => ({ eq: updateChainEqMock }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
});

describe("calendar action dispatch", () => {
  beforeEach(() => {
    pendingTest.clearAll();
  });

  it("propose_calendar_event sets pending", async () => {
    await executeActions(
      [{
        kind: "propose_calendar_event",
        title: "ABC",
        start: new Date(Date.now() + 3600000).toISOString(),
        end: new Date(Date.now() + 7200000).toISOString(),
      }],
      999
    );
    const p = getPending(999);
    expect(p?.kind).toBe("register");
    if (p?.kind === "register") {
      expect(p.title).toBe("ABC");
    }
  });

  it("propose with invalid range silently rejects (graceful)", async () => {
    await executeActions(
      [{
        kind: "propose_calendar_event",
        title: "ABC",
        start: new Date(Date.now() + 7200000).toISOString(),
        end: new Date(Date.now() + 3600000).toISOString(),
      }],
      999
    );
    expect(getPending(999)).toBeNull();
  });

  it("propose_calendar_delete sets pending", async () => {
    await executeActions(
      [{
        kind: "propose_calendar_delete",
        targetUid: "UID-DEL",
        display: "내일 15:00 ABC",
      }],
      999
    );
    const p = getPending(999);
    expect(p?.kind).toBe("delete");
    if (p?.kind === "delete") {
      expect(p.targetUid).toBe("UID-DEL");
    }
  });

  it("confirm without pending is no-op (graceful)", async () => {
    await executeActions([{ kind: "confirm_calendar_action" }], 999);
    expect(addEventMock).not.toHaveBeenCalled();
    expect(deleteEventMock).not.toHaveBeenCalled();
  });

  it("confirm with register pending calls addEvent + records bot_write", async () => {
    setPending(999, {
      kind: "register",
      title: "ABC",
      start: new Date(Date.now() + 3600000).toISOString(),
      end: new Date(Date.now() + 7200000).toISOString(),
    });

    await executeActions([{ kind: "confirm_calendar_action" }], 999);

    expect(addEventMock).toHaveBeenCalledTimes(1);
    expect(recordBotWriteMock).toHaveBeenCalledWith({
      targetTable: "apple_calendar",
      targetId: "UID-NEW",
      notes: expect.stringContaining("ABC"),
    });
    expect(getPending(999)).toBeNull();
  });

  it("confirm with delete pending calls deleteEvent + marks bot_write edited", async () => {
    deleteSelectChain.mockResolvedValue({ data: [{ id: "BW-X" }], error: null });
    setPending(999, {
      kind: "delete",
      targetUid: "UID-DEL",
      display: "내일 15:00 ABC",
    });

    await executeActions([{ kind: "confirm_calendar_action" }], 999);

    expect(deleteEventMock).toHaveBeenCalledWith("UID-DEL");
    expect(markBotWriteEditedMock).toHaveBeenCalledWith("BW-X");
    expect(getPending(999)).toBeNull();
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

  it("record_routine_check upserts to routine_checks", async () => {
    await executeActions(
      [{ kind: "record_routine_check", item_id: "ITEM-1", checked: true, date: "2026-05-08" }],
      999
    );
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith(
      { item_id: "ITEM-1", date: "2026-05-08", checked: true },
      { onConflict: "item_id,date" }
    );
  });

  it("record_condition upserts only provided fields", async () => {
    await executeActions(
      [{
        kind: "record_condition",
        date: "2026-05-08",
        sleep_score: 2,
        sleep_text: "분명 잘잤는데 개운하지 않아",
      }],
      999
    );
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const call = upsertMock.mock.calls[0]!;
    const patch = call[0] as Record<string, unknown>;
    const opts = call[1];
    expect(patch).toMatchObject({
      date: "2026-05-08",
      sleep_score: 2,
      sleep_text: "분명 잘잤는데 개운하지 않아",
    });
    expect(patch.mood_score).toBeUndefined();
    expect(opts).toEqual({ onConflict: "date" });
  });

  it("record_meal upserts to daily_log", async () => {
    await executeActions(
      [{ kind: "record_meal", date: "2026-05-08", lunch: "김밥" }],
      999
    );
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const call = upsertMock.mock.calls[0]!;
    expect(call[0]).toMatchObject({
      date: "2026-05-08",
      lunch: "김밥",
    });
  });

  it("propose_routine_change sets routine pending", async () => {
    await executeActions(
      [{
        kind: "propose_routine_change",
        change: "remove",
        name: "옥상 5분",
        time_slot: "afternoon",
        reason: "에너지 2점↓ 3일 연속",
      }],
      999
    );
    const p = getRoutinePending(999);
    expect(p?.change).toBe("remove");
    expect(p?.name).toBe("옥상 5분");
  });

  it("confirm_routine_change(add) inserts new routine_items row", async () => {
    setRoutinePending(999, {
      change: "add",
      name: "스트레칭 10분",
      time_slot: "evening",
      reason: "에너지 4점 4주 연속",
    });
    await executeActions([{ kind: "confirm_routine_change" }], 999);
    expect(insertMock).toHaveBeenCalledWith({
      name: "스트레칭 10분",
      time_slot: "evening",
      is_active: true,
    });
    expect(getRoutinePending(999)).toBeNull();
  });

  it("confirm_routine_change(remove) deactivates by name", async () => {
    setRoutinePending(999, {
      change: "remove",
      name: "옥상 5분",
      time_slot: "afternoon",
      reason: "..",
    });
    await executeActions([{ kind: "confirm_routine_change" }], 999);
    expect(updateChainEqMock).toHaveBeenCalledTimes(1);
    expect(getRoutinePending(999)).toBeNull();
  });

  it("confirm_routine_change without pending is no-op", async () => {
    await executeActions([{ kind: "confirm_routine_change" }], 999);
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateChainEqMock).not.toHaveBeenCalled();
  });

  it("cancel_routine_change clears pending", async () => {
    setRoutinePending(999, {
      change: "add",
      name: "X",
      time_slot: "morning",
      reason: "test",
    });
    await executeActions([{ kind: "cancel_routine_change" }], 999);
    expect(getRoutinePending(999)).toBeNull();
  });

  it("confirm failure (osascript error) sends system message to owner", async () => {
    setPending(999, {
      kind: "register",
      title: "ABC",
      start: new Date(Date.now() + 3600000).toISOString(),
      end: new Date(Date.now() + 7200000).toISOString(),
    });
    addEventMock.mockRejectedValueOnce(new Error("Not authorized to send Apple events"));

    await executeActions([{ kind: "confirm_calendar_action" }], 999);

    expect(sendToOwnerMock).toHaveBeenCalledTimes(1);
    expect(sendToOwnerMock).toHaveBeenCalledWith(
      expect.stringContaining("권한"),
      "system"
    );
  });
});
