import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock, requireSessionMock, revalidatePathMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  requireSessionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));
vi.mock("@/lib/auth/requireSession", () => ({ requireSession: requireSessionMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { upsertTodayDiary, updateDiary, deleteDiary } from "./actions";

function authed() { requireSessionMock.mockResolvedValue({ ok: true, user: { id: "u1" } }); }
function unauthed() { requireSessionMock.mockResolvedValue({ ok: false, response: new Response() }); }

describe("upsertTodayDiary", () => {
  beforeEach(() => vi.clearAllMocks());

  test("미인증 거부", async () => {
    unauthed();
    const r = await upsertTodayDiary("2026-04-27", { content: "x", emotion: "😊 행복" });
    expect(r.ok).toBe(false);
  });

  test("빈 content 거부", async () => {
    authed();
    const r = await upsertTodayDiary("2026-04-27", { content: " ", emotion: "" });
    expect(r.ok).toBe(false);
  });

  test("8192자 초과 거부", async () => {
    authed();
    const r = await upsertTodayDiary("2026-04-27", { content: "x".repeat(8193), emotion: "" });
    expect(r.ok).toBe(false);
  });

  test("잘못된 emotion 거부", async () => {
    authed();
    const r = await upsertTodayDiary("2026-04-27", { content: "x", emotion: "INVALID" });
    expect(r.ok).toBe(false);
  });

  test("정상 입력 → upsert + revalidate", async () => {
    authed();
    const upsertMock = vi.fn(() => Promise.resolve({ error: null }));
    fromMock.mockReturnValue({ upsert: upsertMock });
    const r = await upsertTodayDiary("2026-04-27", { content: "오늘은 좋은 하루", emotion: "😊 행복" });
    expect(r.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      { date: "2026-04-27", content: "오늘은 좋은 하루", emotion: "😊 행복" },
      { onConflict: "date" }
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/diary");
    expect(revalidatePathMock).toHaveBeenCalledWith("/home");
  });

  test("emotion 빈 문자열은 null로 저장", async () => {
    authed();
    const upsertMock = vi.fn(() => Promise.resolve({ error: null }));
    fromMock.mockReturnValue({ upsert: upsertMock });
    await upsertTodayDiary("2026-04-27", { content: "x", emotion: "" });
    const arg = upsertMock.mock.calls[0][0];
    expect(arg.emotion).toBeNull();
  });
});

describe("deleteDiary", () => {
  beforeEach(() => vi.clearAllMocks());

  test("미인증 거부", async () => {
    unauthed();
    const r = await deleteDiary("d1");
    expect(r.ok).toBe(false);
  });

  test("정상 삭제", async () => {
    authed();
    const eqMock = vi.fn(() => Promise.resolve({ error: null }));
    fromMock.mockReturnValue({ delete: vi.fn(() => ({ eq: eqMock })) });
    const r = await deleteDiary("d1");
    expect(r.ok).toBe(true);
  });
});
