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
