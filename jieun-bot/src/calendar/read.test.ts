import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

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
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(null, { stdout: "AAAA-1111\x1fABC 회의\x1f2026-05-04\x1f15:00\x1f16:00\n" });
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
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) =>
      cb(null, { stdout: "" })
    );
    const events = await fetchEvents({ from: "2026-05-04", to: "2026-05-04" });
    expect(events).toEqual([]);
  });

  it("ignores malformed lines without 5 fields", async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(null, { stdout: "BAD-LINE\nAAAA\x1fOK\x1f2026-05-04\x1f10:00\x1f11:00\n" });
    });
    const events = await fetchEvents({ from: "2026-05-04", to: "2026-05-04" });
    expect(events).toHaveLength(1);
    expect(events[0]?.uid).toBe("AAAA");
  });

  it("passes -ic <name> for personal calendar isolation", async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) =>
      cb(null, { stdout: "" })
    );
    await fetchEvents({ from: "2026-05-04", to: "2026-05-04" });
    const args = execFileMock.mock.calls[0]?.[1] as string[];
    expect(args).toContain("-ic");
    const icIdx = args.indexOf("-ic");
    expect(args[icIdx + 1]).toBe("다영의 개인");
  });

  it("rejects when JIEUN_CALENDAR_INCLUDE empty", async () => {
    vi.resetModules();
    vi.doMock("../env.js", () => ({
      loadEnv: () => ({ JIEUN_CALENDAR_INCLUDE: "", LOG_DIR: "/tmp" }),
    }));
    const mod = await import("./read.js");
    await expect(
      mod.fetchEvents({ from: "2026-05-04", to: "2026-05-04" })
    ).rejects.toThrow(/JIEUN_CALENDAR_INCLUDE/);
    vi.doUnmock("../env.js");
  });

  it("propagates icalBuddy non-zero exit as error", async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      const err = new Error("Command failed: icalBuddy") as Error & { code?: number };
      err.code = 1;
      cb(err, { stdout: "" });
    });
    await expect(
      fetchEvents({ from: "2026-05-04", to: "2026-05-04" })
    ).rejects.toThrow();
  });
});
