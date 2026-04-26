import { describe, test, expect, vi, beforeEach } from "vitest";

const { insertMock, fromMock, requireSessionMock, revalidatePathMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  const requireSessionMock = vi.fn();
  const revalidatePathMock = vi.fn();
  return { insertMock, fromMock, requireSessionMock, revalidatePathMock };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));
vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: requireSessionMock,
}));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { createQuickMemo } from "./actions";

describe("createQuickMemo", () => {
  beforeEach(() => {
    insertMock.mockReset();
    fromMock.mockClear();
    requireSessionMock.mockReset();
    revalidatePathMock.mockReset();
  });

  test("미인증이면 ok=false, error=Unauthorized", async () => {
    requireSessionMock.mockResolvedValue({ ok: false, response: new Response() });
    const result = await createQuickMemo("hello");
    expect(result).toEqual({ ok: false, error: "Unauthorized" });
    expect(insertMock).not.toHaveBeenCalled();
  });

  test("빈 content는 ok=false", async () => {
    requireSessionMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
    const result = await createQuickMemo("   ");
    expect(result).toEqual({ ok: false, error: "Invalid content" });
    expect(insertMock).not.toHaveBeenCalled();
  });

  test("512자 초과는 ok=false", async () => {
    requireSessionMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
    const long = "x".repeat(513);
    const result = await createQuickMemo(long);
    expect(result.ok).toBe(false);
  });

  test("정상 입력은 insert + revalidate + ok=true", async () => {
    requireSessionMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
    insertMock.mockResolvedValue({ error: null });
    const result = await createQuickMemo("새 메모");
    expect(result).toEqual({ ok: true });
    expect(insertMock).toHaveBeenCalledWith({ content: "새 메모", tag: "발견" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/home");
    expect(revalidatePathMock).toHaveBeenCalledWith("/memo");
  });

  test("DB 오류는 ok=false", async () => {
    requireSessionMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
    insertMock.mockResolvedValue({ error: new Error("db") });
    const result = await createQuickMemo("메모");
    expect(result).toEqual({ ok: false, error: "Save failed" });
  });
});
