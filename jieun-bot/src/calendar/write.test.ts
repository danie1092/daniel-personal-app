import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("../env.js", () => ({
  loadEnv: () => ({ JIEUN_CALENDAR_INCLUDE: "다영의 개인", LOG_DIR: "/tmp" }),
}));

import { execFile } from "node:child_process";
import { addEvent, deleteEvent, __test } from "./write.js";

const execFileMock = execFile as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  execFileMock.mockReset();
});

describe("calendar/write.ts addEvent", () => {
  it("decomposes ISO start to KST components for argv", async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) =>
      cb(null, { stdout: "ABC-UID-1234\n" })
    );

    const uid = await addEvent({
      title: "ABC 회의",
      start: "2026-05-04T15:00:00+09:00",
      end: "2026-05-04T16:30:00+09:00",
    });

    expect(uid).toBe("ABC-UID-1234");
    const args = execFileMock.mock.calls[0]?.[1] as string[];
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
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) =>
      cb(null, { stdout: "  UID-X\n  \n" })
    );
    const uid = await addEvent({
      title: "X",
      start: "2026-05-04T15:00:00+09:00",
      end: "2026-05-04T16:00:00+09:00",
    });
    expect(uid).toBe("UID-X");
  });

  it("rejects when osascript fails (TCC permission etc)", async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(new Error("Not authorized to send Apple events to Calendar."), { stdout: "" });
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
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) =>
      cb(null, { stdout: "ok\n" })
    );
    await deleteEvent("UID-X");
    const args = execFileMock.mock.calls[0]?.[1] as string[];
    expect(args[args.length - 2]).toBe("다영의 개인");
    expect(args[args.length - 1]).toBe("UID-X");
  });

  it("propagates 'no event with uid' error", async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(new Error("no event with uid X"), { stdout: "" });
    });
    await expect(deleteEvent("X")).rejects.toThrow(/no event with uid/);
  });
});

describe("calendar/write.ts decomposeKst", () => {
  const { decomposeKst } = __test;

  it("decomposes KST-offset ISO to date components", () => {
    expect(decomposeKst("2026-05-04T15:00:00+09:00")).toEqual({
      year: 2026,
      month: 5,
      day: 4,
      hour: 15,
      minute: 0,
    });
  });

  it("converts UTC ISO to KST equivalent (+9h)", () => {
    // 2026-05-04T06:00:00Z === 2026-05-04T15:00:00+09:00
    expect(decomposeKst("2026-05-04T06:00:00Z")).toEqual({
      year: 2026,
      month: 5,
      day: 4,
      hour: 15,
      minute: 0,
    });
  });

  it("rolls year/month/day forward when KST crosses midnight", () => {
    // 2026-05-04T15:00:00Z === 2026-05-05T00:00:00+09:00
    expect(decomposeKst("2026-05-04T15:00:00Z")).toEqual({
      year: 2026,
      month: 5,
      day: 5,
      hour: 0,
      minute: 0,
    });
  });

  it("throws on invalid ISO", () => {
    expect(() => decomposeKst("not-a-date")).toThrow(/invalid ISO/);
  });
});
