import { describe, test, expect, vi, beforeEach } from "vitest";

const { fromMock, safeFetchMock, parseOGMetaMock, curateItemMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  safeFetchMock: vi.fn(),
  parseOGMetaMock: vi.fn(),
  curateItemMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: fromMock }),
}));
vi.mock("@/lib/og/safeFetch", () => ({ safeFetch: safeFetchMock }));
vi.mock("@/lib/og/parseMeta", () => ({ parseOGMeta: parseOGMetaMock }));
vi.mock("./curate", () => ({ curateItem: curateItemMock }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://x";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
});

import { processCollectedItem } from "./process";

function mockSelect(row: Record<string, unknown> | null) {
  fromMock.mockReturnValueOnce({
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
    }),
  });
}
function mockUpdate() {
  const eq = vi.fn(() => Promise.resolve({ error: null }));
  fromMock.mockReturnValueOnce({ update: vi.fn(() => ({ eq })) });
  return eq;
}

describe("processCollectedItem", () => {
  test("이미 처리됨 → skipped", async () => {
    mockSelect({ id: "i1", url: "https://x", memo: null, processed_at: "2026-04-27" });
    const r = await processCollectedItem("i1");
    expect(r).toBe("skipped");
  });

  test("row 없음 → permanent_failure", async () => {
    mockSelect(null);
    const r = await processCollectedItem("i1");
    expect(r).toBe("permanent_failure");
  });

  test("정상 흐름 → success + 모든 칼럼 갱신", async () => {
    mockSelect({ id: "i1", url: "https://x", memo: "메모", processed_at: null });
    safeFetchMock.mockResolvedValue({ status: 200, body: "<html>", finalUrl: "https://x" });
    parseOGMetaMock.mockReturnValue({ title: "T", description: "D", image: "I" });
    curateItemMock.mockResolvedValue({ ok: true, summary: "요약", category: "여행" });
    mockUpdate();
    const r = await processCollectedItem("i1");
    expect(r).toBe("success");
  });

  test("OG fetch 실패해도 빈 메타로 curate 호출", async () => {
    mockSelect({ id: "i1", url: "https://x", memo: null, processed_at: null });
    safeFetchMock.mockResolvedValue({ error: "timeout" });
    curateItemMock.mockResolvedValue({ ok: true, summary: "x", category: "기타" });
    mockUpdate();
    await processCollectedItem("i1");
    const arg = curateItemMock.mock.calls[0][0];
    expect(arg.ogTitle).toBe("");
    expect(arg.ogDescription).toBe("");
  });

  test("transient 실패 → attempts++, transient_failure", async () => {
    mockSelect({ id: "i1", url: "https://x", memo: null, processed_at: null });
    safeFetchMock.mockResolvedValue({ status: 200, body: "", finalUrl: "https://x" });
    parseOGMetaMock.mockReturnValue({ title: "", description: "", image: "" });
    curateItemMock.mockResolvedValue({ ok: false, kind: "transient", error: "503" });
    mockUpdate();
    const r = await processCollectedItem("i1");
    expect(r).toBe("transient_failure");
  });

  test("permanent 실패 → attempts++, permanent_failure", async () => {
    mockSelect({ id: "i1", url: "https://x", memo: null, processed_at: null });
    safeFetchMock.mockResolvedValue({ status: 200, body: "", finalUrl: "https://x" });
    parseOGMetaMock.mockReturnValue({ title: "", description: "", image: "" });
    curateItemMock.mockResolvedValue({ ok: false, kind: "permanent", error: "bad" });
    mockUpdate();
    const r = await processCollectedItem("i1");
    expect(r).toBe("permanent_failure");
  });

  test("성공 시 update 인자에 처리 칼럼 모두 포함", async () => {
    mockSelect({ id: "i1", url: "https://x", memo: null, processed_at: null });
    safeFetchMock.mockResolvedValue({ status: 200, body: "<html>", finalUrl: "https://x" });
    parseOGMetaMock.mockReturnValue({ title: "T", description: "D", image: "I" });
    curateItemMock.mockResolvedValue({ ok: true, summary: "요약", category: "여행" });
    const updateMock = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
    fromMock.mockReturnValueOnce({ update: updateMock });
    await processCollectedItem("i1");
    const patch = updateMock.mock.calls[0][0];
    expect(patch.summary).toBe("요약");
    expect(patch.category).toBe("여행");
    expect(patch.og_title).toBe("T");
    expect(patch.og_description).toBe("D");
    expect(patch.og_image).toBe("I");
    expect(patch.processed_at).toBeTruthy();
    expect(patch.last_error).toBeNull();
  });

  test("transient 실패 시 update 인자에 attempts++만 포함", async () => {
    mockSelect({ id: "i1", url: "https://x", memo: null, processed_at: null });
    safeFetchMock.mockResolvedValue({ status: 200, body: "", finalUrl: "https://x" });
    parseOGMetaMock.mockReturnValue({ title: "", description: "", image: "" });
    curateItemMock.mockResolvedValue({ ok: false, kind: "transient", error: "503" });
    const updateMock = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
    fromMock.mockReturnValueOnce({ update: updateMock });
    await processCollectedItem("i1");
    const patch = updateMock.mock.calls[0][0];
    expect(patch.processing_attempts).toBeDefined();
    expect(patch.last_error).toContain("transient");
    expect(patch.processed_at).toBeUndefined();
  });
});
