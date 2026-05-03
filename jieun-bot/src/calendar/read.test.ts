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
