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

import { createMemo, updateMemo, deleteMemo, saveInboxGroups } from "./actions";

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

describe("saveInboxGroups", () => {
  beforeEach(() => vi.clearAllMocks());

  test("미인증 거부", async () => {
    unauthed();
    const r = await saveInboxGroups([{ tag: "발견", content: "x", item_ids: ["i1"], topic: "t" }]);
    expect(r.ok).toBe(false);
  });

  test("빈 그룹 거부", async () => {
    authed();
    const r = await saveInboxGroups([]);
    expect(r.ok).toBe(false);
  });

  test("정상 저장 → memo insert + collected_items update + revalidate", async () => {
    authed();
    const insertMock = vi.fn(() => Promise.resolve({ error: null }));
    const updateInMock = vi.fn(() => Promise.resolve({ error: null }));
    const updateMock = vi.fn(() => ({ in: updateInMock }));
    fromMock
      .mockReturnValueOnce({ insert: insertMock })       // memo_entries
      .mockReturnValueOnce({ update: updateMock });      // collected_items
    const r = await saveInboxGroups([
      { tag: "발견", content: "x", item_ids: ["i1", "i2"], topic: "t1" },
      { tag: "생각중", content: "y", item_ids: ["i3"], topic: "t2" },
    ]);
    expect(r.ok).toBe(true);
    expect(insertMock).toHaveBeenCalledWith([
      { content: "x", tag: "발견" },
      { content: "y", tag: "생각중" },
    ]);
    expect(updateMock).toHaveBeenCalledWith({ is_processed: true });
    expect(updateInMock).toHaveBeenCalledWith("id", ["i1", "i2", "i3"]);
  });
});
