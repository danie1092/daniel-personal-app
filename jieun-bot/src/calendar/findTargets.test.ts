import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { findDeletionCandidates } from "./findTargets.js";

beforeEach(() => {
  mockSelect.mockReset();
});

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
