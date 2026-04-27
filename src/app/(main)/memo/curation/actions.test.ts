import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock, requireSessionMock, revalidatePathMock, processMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  requireSessionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  processMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));
vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: requireSessionMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/curation/process", () => ({ processCollectedItem: processMock }));

beforeEach(() => {
  vi.clearAllMocks();
  requireSessionMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
});

import { updateCurationCategory, deleteCuration, reprocessCuration } from "./actions";

describe("updateCurationCategory", () => {
  test("미인증 → 거부", async () => {
    requireSessionMock.mockResolvedValue({ ok: false, response: new Response() });
    const r = await updateCurationCategory("i1", "여행");
    expect(r.ok).toBe(false);
  });

  test("invalid category → 거부", async () => {
    const r = await updateCurationCategory("i1", "랜덤" as never);
    expect(r.ok).toBe(false);
  });

  test("정상 → update + revalidate", async () => {
    const eq = vi.fn(() => Promise.resolve({ error: null }));
    fromMock.mockReturnValue({ update: vi.fn(() => ({ eq })) });
    const r = await updateCurationCategory("i1", "여행");
    expect(r.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/memo");
  });
});

describe("deleteCuration", () => {
  test("미인증 → 거부", async () => {
    requireSessionMock.mockResolvedValue({ ok: false, response: new Response() });
    const r = await deleteCuration("i1");
    expect(r.ok).toBe(false);
  });

  test("정상 삭제", async () => {
    const eq = vi.fn(() => Promise.resolve({ error: null }));
    fromMock.mockReturnValue({ delete: vi.fn(() => ({ eq })) });
    const r = await deleteCuration("i1");
    expect(r.ok).toBe(true);
  });
});

describe("reprocessCuration", () => {
  test("정상 → reset + processCollectedItem 호출", async () => {
    const eq = vi.fn(() => Promise.resolve({ error: null }));
    fromMock.mockReturnValue({ update: vi.fn(() => ({ eq })) });
    processMock.mockResolvedValue("success");
    const r = await reprocessCuration("i1");
    expect(r.ok).toBe(true);
    expect(processMock).toHaveBeenCalledWith("i1");
  });
});
