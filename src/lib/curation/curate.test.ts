import { describe, test, expect, vi, beforeEach } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: createMock },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "k";
});

import { curateItem } from "./curate";

describe("curateItem", () => {
  test("정상 응답 파싱", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: '{"summary":"신사동 카페 추천","category":"음식·카페"}' }],
    });
    const r = await curateItem({
      url: "https://instagram.com/p/x", memo: null,
      ogTitle: "카페", ogDescription: "맛있음",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.summary).toBe("신사동 카페 추천");
      expect(r.category).toBe("음식·카페");
    }
  });

  test("system에 cache_control 포함", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: '{"summary":"x","category":"기타"}' }],
    });
    await curateItem({ url: "https://x", memo: null, ogTitle: "", ogDescription: "" });
    const arg = createMock.mock.calls[0][0];
    expect(Array.isArray(arg.system)).toBe(true);
    expect(arg.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  test("invalid category → permanent", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: '{"summary":"x","category":"하이"}' }],
    });
    const r = await curateItem({ url: "https://x", memo: null, ogTitle: "", ogDescription: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("permanent");
  });

  test("invalid JSON → permanent", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "이상한 텍스트" }],
    });
    const r = await curateItem({ url: "https://x", memo: null, ogTitle: "", ogDescription: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("permanent");
  });

  test("summary 빈 문자열 → permanent", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: '{"summary":"","category":"여행"}' }],
    });
    const r = await curateItem({ url: "https://x", memo: null, ogTitle: "", ogDescription: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("permanent");
  });

  test("summary 200자 초과 → 자르기(success)", async () => {
    const long = "가".repeat(300);
    createMock.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ summary: long, category: "여행" }) }],
    });
    const r = await curateItem({ url: "https://x", memo: null, ogTitle: "", ogDescription: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary.length).toBe(200);
  });

  test("Anthropic 5xx → transient", async () => {
    const err: Error & { status?: number } = new Error("server");
    err.status = 503;
    createMock.mockRejectedValue(err);
    const r = await curateItem({ url: "https://x", memo: null, ogTitle: "", ogDescription: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("transient");
  });

  test("Anthropic 400 → permanent", async () => {
    const err: Error & { status?: number } = new Error("bad");
    err.status = 400;
    createMock.mockRejectedValue(err);
    const r = await curateItem({ url: "https://x", memo: null, ogTitle: "", ogDescription: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("permanent");
  });
});
