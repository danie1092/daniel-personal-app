import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock, requireSessionMock, revalidatePathMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  requireSessionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));
vi.mock("@/lib/auth/requireSession", () => ({
  requireSession: requireSessionMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { createMemo, updateMemo, deleteMemo } from "./actions";

function authed() {
  requireSessionMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
}
function unauthed() {
  requireSessionMock.mockResolvedValue({ ok: false, response: new Response() });
}

describe("createMemo", () => {
  beforeEach(() => vi.clearAllMocks());

  test("미인증 거부", async () => {
    unauthed();
    const r = await createMemo({ content: "x", tag: "발견" });
    expect(r.ok).toBe(false);
  });

  test("빈 content 거부", async () => {
    authed();
    const r = await createMemo({ content: "  ", tag: "발견" });
    expect(r.ok).toBe(false);
  });

  test("8192자 초과 거부", async () => {
    authed();
    const r = await createMemo({ content: "x".repeat(8193), tag: "발견" });
    expect(r.ok).toBe(false);
  });

  test("잘못된 태그 거부", async () => {
    authed();
    const r = await createMemo({ content: "x", tag: "INVALID" });
    expect(r.ok).toBe(false);
  });

  test("정상 입력 → insert + revalidate", async () => {
    authed();
    const insertMock = vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: "m1" }, error: null })) })),
    }));
    fromMock.mockReturnValue({ insert: insertMock });
    const r = await createMemo({ content: "새 메모", tag: "발견" });
    expect(r.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/memo");
    expect(revalidatePathMock).toHaveBeenCalledWith("/home");
  });
});

describe("updateMemo", () => {
  beforeEach(() => vi.clearAllMocks());

  test("미인증 거부", async () => {
    unauthed();
    const r = await updateMemo("m1", { content: "x", tag: "발견" });
    expect(r.ok).toBe(false);
  });

  test("정상 update", async () => {
    authed();
    const eqMock = vi.fn(() => Promise.resolve({ error: null }));
    fromMock.mockReturnValue({ update: vi.fn(() => ({ eq: eqMock })) });
    const r = await updateMemo("m1", { content: "새 내용", tag: "발견" });
    expect(r.ok).toBe(true);
  });
});

describe("deleteMemo", () => {
  beforeEach(() => vi.clearAllMocks());

  test("미인증 거부", async () => {
    unauthed();
    const r = await deleteMemo("m1");
    expect(r.ok).toBe(false);
  });

  test("정상 삭제", async () => {
    authed();
    const eqMock = vi.fn(() => Promise.resolve({ error: null }));
    fromMock.mockReturnValue({ delete: vi.fn(() => ({ eq: eqMock })) });
    const r = await deleteMemo("m1");
    expect(r.ok).toBe(true);
  });
});
