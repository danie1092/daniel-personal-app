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

import {
  toggleRoutineCheck,
  createRoutineItem,
  updateRoutineItem,
  deleteRoutineItem,
} from "./actions";

function authed() {
  requireSessionMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
}
function unauthed() {
  requireSessionMock.mockResolvedValue({ ok: false, response: new Response() });
}

describe("toggleRoutineCheck", () => {
  beforeEach(() => vi.clearAllMocks());

  test("미인증 거부", async () => {
    unauthed();
    const r = await toggleRoutineCheck("i1", "2026-04-27", true);
    expect(r.ok).toBe(false);
  });

  test("checked=true → upsert", async () => {
    authed();
    const upsertMock = vi.fn(() => Promise.resolve({ error: null }));
    fromMock.mockReturnValue({ upsert: upsertMock });
    const r = await toggleRoutineCheck("i1", "2026-04-27", true);
    expect(r.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      { item_id: "i1", date: "2026-04-27", checked: true },
      { onConflict: "item_id,date" }
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/routine");
    expect(revalidatePathMock).toHaveBeenCalledWith("/home");
  });

  test("checked=false → delete", async () => {
    authed();
    const eqEqMock = vi.fn(() => Promise.resolve({ error: null }));
    const eqMock = vi.fn(() => ({ eq: eqEqMock }));
    const deleteMock = vi.fn(() => ({ eq: eqMock }));
    fromMock.mockReturnValue({ delete: deleteMock });
    const r = await toggleRoutineCheck("i1", "2026-04-27", false);
    expect(r.ok).toBe(true);
    expect(deleteMock).toHaveBeenCalled();
  });

  test("잘못된 날짜 거부", async () => {
    authed();
    const r = await toggleRoutineCheck("i1", "20260427", true);
    expect(r.ok).toBe(false);
  });
});

describe("createRoutineItem", () => {
  beforeEach(() => vi.clearAllMocks());

  test("미인증 거부", async () => {
    unauthed();
    const r = await createRoutineItem({ name: "운동", emoji: "🏃" });
    expect(r.ok).toBe(false);
  });

  test("빈 name 거부", async () => {
    authed();
    const r = await createRoutineItem({ name: "  ", emoji: "🏃" });
    expect(r.ok).toBe(false);
  });

  test("name 100자 초과 거부", async () => {
    authed();
    const r = await createRoutineItem({ name: "x".repeat(101), emoji: "🏃" });
    expect(r.ok).toBe(false);
  });

  test("정상 입력 → max sort_order + 1로 insert", async () => {
    authed();
    // first call: select existing items (for max sort_order)
    const orderResolveOnce = vi.fn(() => Promise.resolve({ data: [{ sort_order: 5 }], error: null }));
    const selectChain = { select: vi.fn(() => ({ order: orderResolveOnce })) };
    fromMock.mockReturnValueOnce(selectChain);
    // second call: insert
    const insertMock = vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: "new-id" }, error: null })) })),
    }));
    fromMock.mockReturnValueOnce({ insert: insertMock });

    const r = await createRoutineItem({ name: "운동", emoji: "🏃" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.id).toBe("new-id");
    const arg = insertMock.mock.calls[0][0];
    expect(arg.name).toBe("운동");
    expect(arg.emoji).toBe("🏃");
    expect(arg.sort_order).toBe(6);
  });
});

describe("deleteRoutineItem", () => {
  beforeEach(() => vi.clearAllMocks());

  test("미인증 거부", async () => {
    unauthed();
    const r = await deleteRoutineItem("i1");
    expect(r.ok).toBe(false);
  });

  test("정상 삭제", async () => {
    authed();
    const eqMock = vi.fn(() => Promise.resolve({ error: null }));
    const deleteMock = vi.fn(() => ({ eq: eqMock }));
    fromMock.mockReturnValue({ delete: deleteMock });
    const r = await deleteRoutineItem("i1");
    expect(r.ok).toBe(true);
  });
});
