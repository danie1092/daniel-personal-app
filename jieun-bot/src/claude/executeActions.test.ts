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

// db mock — chainable .from().insert().select().single() 체인 + .from().select().eq()...
// budget_insert 경로와 confirm_calendar_action(delete) 경로 모두 커버.
const insertSingleMock = vi.fn();
const deleteSelectChain = vi.fn();
const dbFromMock = vi.fn();

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

beforeEach(() => {
  insertSingleMock.mockReset();
  deleteSelectChain.mockReset();
  dbFromMock.mockReset();
  recordBotWriteMock.mockClear();
  markBotWriteEditedMock.mockClear();
  addEventMock.mockClear();
  deleteEventMock.mockClear();
  sendToOwnerMock.mockClear();
  pendingTest.clearAll();

  // default budget_insert chain
  dbFromMock.mockImplementation((table: string) => {
    if (table === "budget_entries") {
      return {
        insert: () => ({
          select: () => ({
            single: insertSingleMock,
          }),
        }),
      };
    }
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
    throw new Error(`unexpected table ${table}`);
  });
});

describe("executeActions — budget_insert", () => {
  it("inserts row + records bot_write", async () => {
    insertSingleMock.mockResolvedValue({ data: { id: "BE-1" }, error: null });

    await executeActions(
      [{
        kind: "budget_insert",
        amount: 7000,
        category: "식사",
        memo: "김밥",
        type: "expense",
        date_offset: 0,
      }],
      999
    );

    expect(insertSingleMock).toHaveBeenCalledTimes(1);
    expect(recordBotWriteMock).toHaveBeenCalledTimes(1);
    expect(recordBotWriteMock).toHaveBeenCalledWith({
      targetTable: "budget_entries",
      targetId: "BE-1",
      notes: expect.stringContaining("김밥"),
    });
  });

  it("swallows DB error, does not throw", async () => {
    insertSingleMock.mockResolvedValue({ data: null, error: { message: "boom", code: "23505" } });

    await expect(
      executeActions(
        [{
          kind: "budget_insert",
          amount: 7000,
          category: "식사",
          memo: "김밥",
          type: "expense",
          date_offset: 0,
        }],
        999
      )
    ).resolves.toBeUndefined();

    expect(recordBotWriteMock).not.toHaveBeenCalled();
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
