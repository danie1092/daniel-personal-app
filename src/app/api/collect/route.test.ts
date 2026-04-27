import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock, checkLimitMock, processMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  checkLimitMock: vi.fn(),
  processMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: fromMock }),
}));
vi.mock("@/lib/rateLimit/upstash", () => ({
  checkCollectLimit: checkLimitMock,
}));
vi.mock("@/lib/curation/process", () => ({
  processCollectedItem: processMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.COLLECT_API_KEY = "tok";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://x";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  process.env.DEFAULT_USER_ID = "u1";
  checkLimitMock.mockResolvedValue({ ok: true });
  processMock.mockResolvedValue("success");
});

function req(body: unknown, headers: Record<string, string> = { authorization: "Bearer tok" }) {
  return new Request("http://x/api/collect", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function mockInsertOk(id = "i1") {
  fromMock
    .mockReturnValueOnce({ // duplicate check select
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
    })
    .mockReturnValueOnce({ // insert
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id }, error: null }) }) }),
    });
}

import { POST } from "./route";

describe("POST /api/collect", () => {
  test("Bearer 불일치 → 401", async () => {
    const r = await POST(req({ url: "https://x" }, { authorization: "Bearer wrong" }) as never);
    expect(r.status).toBe(401);
  });

  test("rate limit 초과 → 429 + Retry-After", async () => {
    checkLimitMock.mockResolvedValue({ ok: false, retryAfter: 42 });
    const r = await POST(req({ url: "https://x" }) as never);
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("42");
  });

  test("URL 부적절 → 400", async () => {
    const r = await POST(req({ url: "ftp://x" }) as never);
    expect(r.status).toBe(400);
  });

  test("중복 → 200 + duplicate=true", async () => {
    fromMock.mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "old" }, error: null }) }) }) }),
    });
    const r = await POST(req({ url: "https://x" }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.duplicate).toBe(true);
  });

  test("정상 insert → 201 + processCollectedItem 호출됨", async () => {
    mockInsertOk("new1");
    const r = await POST(req({ url: "https://x.com/p/abc" }) as never);
    expect(r.status).toBe(201);
    expect(processMock).toHaveBeenCalledWith("new1");
  });

  test("processCollectedItem 실패해도 응답은 201 (베스트-에포트)", async () => {
    mockInsertOk("new2");
    processMock.mockRejectedValue(new Error("anthropic down"));
    const r = await POST(req({ url: "https://x.com/p/abc" }) as never);
    expect(r.status).toBe(201);
  });
});
