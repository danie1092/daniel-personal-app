import { describe, test, expect, vi, beforeEach } from "vitest";

const { insertMock, deleteMock, fromMock, requireSessionMock, revalidatePathMock } = vi.hoisted(() => {
  return {
    insertMock: vi.fn(),
    deleteMock: vi.fn(),
    fromMock: vi.fn(),
    requireSessionMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  };
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

import { createBudgetEntry, deleteBudgetEntry, addFixedExpenses } from "./actions";

function authed() {
  requireSessionMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
}
function unauthed() {
  requireSessionMock.mockResolvedValue({ ok: false, response: new Response() });
}

describe("createBudgetEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReturnValue({ insert: insertMock });
  });

  test("미인증 거부", async () => {
    unauthed();
    const result = await createBudgetEntry({ date: "2026-04-26", category: "식사", description: "x", memo: "", amount: 1000, paymentMethod: "현대카드" });
    expect(result).toEqual({ ok: false, error: "Unauthorized" });
    expect(insertMock).not.toHaveBeenCalled();
  });

  test("amount 정수 아니면 거부", async () => {
    authed();
    const result = await createBudgetEntry({ date: "2026-04-26", category: "식사", description: "x", memo: "", amount: 100.5, paymentMethod: "현대카드" });
    expect(result.ok).toBe(false);
  });

  test("amount 음수 거부", async () => {
    authed();
    const result = await createBudgetEntry({ date: "2026-04-26", category: "식사", description: "x", memo: "", amount: -100, paymentMethod: "현대카드" });
    expect(result.ok).toBe(false);
  });

  test("잘못된 카테고리 거부", async () => {
    authed();
    // @ts-expect-error invalid category test
    const result = await createBudgetEntry({ date: "2026-04-26", category: "INVALID", description: "x", memo: "", amount: 1000, paymentMethod: "현대카드" });
    expect(result.ok).toBe(false);
  });

  test("정상 입력 → insert + revalidate + ok", async () => {
    authed();
    insertMock.mockReturnValue({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: "new-id" }, error: null })) })) });
    const result = await createBudgetEntry({
      date: "2026-04-26",
      category: "식사",
      description: "김치찌개",
      memo: "점심",
      amount: 12000,
      paymentMethod: "우리카드",
    });
    expect(result.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/budget");
    expect(revalidatePathMock).toHaveBeenCalledWith("/home");
  });

  test("월급 카테고리는 paymentMethod null 강제 + type=income", async () => {
    authed();
    insertMock.mockReturnValue({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: "x" }, error: null })) })) });
    await createBudgetEntry({
      date: "2026-04-26", category: "월급", description: "4월 급여", memo: "",
      amount: 3000000, paymentMethod: "우리카드",
    });
    const call = insertMock.mock.calls[0][0];
    expect(call.payment_method).toBeNull();
    expect(call.type).toBe("income");
  });
});

describe("deleteBudgetEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReturnValue({ delete: deleteMock });
  });

  test("미인증 거부", async () => {
    unauthed();
    const result = await deleteBudgetEntry("entry-1");
    expect(result.ok).toBe(false);
  });

  test("정상 삭제 → revalidate", async () => {
    authed();
    deleteMock.mockReturnValue({ eq: vi.fn(() => Promise.resolve({ error: null })) });
    const result = await deleteBudgetEntry("entry-1");
    expect(result.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/budget");
  });
});

describe("addFixedExpenses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("미인증 거부", async () => {
    unauthed();
    const result = await addFixedExpenses("2026-04");
    expect(result.ok).toBe(false);
  });

  test("이미 다 있으면 added=0, skipped=N", async () => {
    authed();
    const existingFromChain = {
      select: vi.fn(() => existingFromChain),
      eq: vi.fn(() => existingFromChain),
      gte: vi.fn(() => existingFromChain),
      lte: vi.fn(() => Promise.resolve({
        data: [
          { description: "건강보험" }, { description: "삼성화재" }, { description: "통신비" },
          { description: "구독" }, { description: "가스비" }, { description: "전기료" },
          { description: "수도" }, { description: "코웨이" }, { description: "관리비" },
          { description: "주담대" },
        ],
        error: null,
      })),
    };
    fromMock.mockReturnValueOnce(existingFromChain);
    const result = await addFixedExpenses("2026-04");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.added).toBe(0);
      expect(result.skipped).toBe(10);
    }
  });
});
