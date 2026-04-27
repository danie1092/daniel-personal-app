import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock, requireBearerMock, checkLimitMock, parseMock, lookupMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  requireBearerMock: vi.fn(),
  checkLimitMock: vi.fn(),
  parseMock: vi.fn(),
  lookupMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: fromMock }),
}));
vi.mock("@/lib/auth/requireBearer", () => ({
  requireBearer: requireBearerMock,
}));
vi.mock("@/lib/rateLimit/upstash", () => ({
  checkBudgetSmsLimit: checkLimitMock,
}));
vi.mock("@/lib/budget/parsers", () => ({
  parse: parseMock,
}));
vi.mock("@/lib/budget/categorize", () => ({
  lookupCategory: lookupMock,
}));

import { POST } from "./route";

function makeReq(body: unknown, auth = "Bearer correct") {
  return new Request("http://localhost/api/budget/auto", {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BUDGET_SMS_SECRET = "correct";
  process.env.DEFAULT_USER_ID = "u1";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "srv";
  requireBearerMock.mockReturnValue({ ok: true });
  checkLimitMock.mockResolvedValue({ ok: true });
});

describe("/api/budget/auto", () => {
  test("secret 누락 → 401", async () => {
    requireBearerMock.mockReturnValue({ ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) });
    const res = await POST(makeReq({ raw_text: "..." }, "Bearer wrong"));
    expect(res.status).toBe(401);
  });

  test("raw_text 4KB 초과 → 400", async () => {
    const big = "x".repeat(4097);
    const res = await POST(makeReq({ raw_text: big }));
    expect(res.status).toBe(400);
  });

  test("rate limit 초과 → 429", async () => {
    checkLimitMock.mockResolvedValue({ ok: false, retryAfter: 30 });
    const res = await POST(makeReq({ raw_text: "현대카드 1000원" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
  });

  test("파싱 실패 → 422", async () => {
    parseMock.mockReturnValue(null);
    const res = await POST(makeReq({ raw_text: "지원 안 하는 형식" }));
    expect(res.status).toBe(422);
  });

  test("정상 + 사전 미스 → 201, 미분류 INSERT (user_id 없음)", async () => {
    parseMock.mockReturnValue({ amount: 1000, merchant: "신규", date: "2026-04-27", payment_method: "현대카드" });
    lookupMock.mockResolvedValue("미분류");
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: "e1" }, error: null }) }),
    });
    fromMock.mockReturnValue({ insert: insertMock });

    const res = await POST(makeReq({ raw_text: "현대카드 1000원" }));
    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      amount: 1000,
      memo: "신규",
      category: "미분류",
      payment_method: "현대카드",
      date: "2026-04-27",
      type: "expense",
    }));
    // budget_entries에 user_id 컬럼 없음 — INSERT payload에도 user_id 빠짐
  });

  test("정상 + 사전 히트 → 201, 분류 적용", async () => {
    parseMock.mockReturnValue({ amount: 5000, merchant: "스타벅스", date: "2026-04-27", payment_method: "현대카드" });
    lookupMock.mockResolvedValue("카페");
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: "e1" }, error: null }) }),
    });
    fromMock.mockReturnValue({ insert: insertMock });

    await POST(makeReq({ raw_text: "현대카드 5000원" }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ category: "카페" }));
  });

  test("UNIQUE 충돌 → 409", async () => {
    parseMock.mockReturnValue({ amount: 1000, merchant: "x", date: "2026-04-27", payment_method: "현대카드" });
    lookupMock.mockResolvedValue("미분류");
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } }) }),
    });
    fromMock.mockReturnValue({ insert: insertMock });

    const res = await POST(makeReq({ raw_text: "현대카드 1000원" }));
    expect(res.status).toBe(409);
  });
});
