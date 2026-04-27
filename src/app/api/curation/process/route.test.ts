import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock, processMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  processMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: fromMock }),
}));
vi.mock("@/lib/curation/process", () => ({
  processCollectedItem: processMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://x";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
});

import { POST } from "./route";

function authedReq(): Request {
  return new Request("http://x/api/curation/process", {
    method: "POST",
    headers: { authorization: "Bearer s" },
  });
}

describe("POST /api/curation/process", () => {
  test("CRON_SECRET 불일치 → 401", async () => {
    const req = new Request("http://x", { method: "POST" });
    const r = await POST(req);
    expect(r.status).toBe(401);
  });

  test("처리할 항목 없음 → processed=0", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        is: () => ({
          lt: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
        }),
      }),
    });
    const r = await POST(authedReq());
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.processed).toBe(0);
  });

  test("3개 항목 → 결과 집계", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        is: () => ({
          lt: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({
            data: [{ id: "a" }, { id: "b" }, { id: "c" }], error: null,
          }) }) }) }),
        }),
      }),
    });
    processMock.mockResolvedValueOnce("success").mockResolvedValueOnce("transient_failure").mockResolvedValueOnce("permanent_failure");
    const r = await POST(authedReq());
    const json = await r.json();
    expect(json.processed).toBe(3);
    expect(json.success).toBe(1);
    expect(json.transient).toBe(1);
    expect(json.permanent).toBe(1);
  });

  test("limit 20개로 호출되는지", async () => {
    const limitMock = vi.fn(() => Promise.resolve({ data: [], error: null }));
    fromMock.mockReturnValue({
      select: () => ({
        is: () => ({
          lt: () => ({ eq: () => ({ order: () => ({ limit: limitMock }) }) }),
        }),
      }),
    });
    await POST(authedReq());
    expect(limitMock).toHaveBeenCalledWith(20);
  });
});
