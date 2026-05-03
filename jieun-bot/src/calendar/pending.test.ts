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
