import { describe, test, expect, vi, beforeEach } from "vitest";

// Supabase 서버 클라이언트를 모킹
const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

import { requireSession } from "./requireSession";

describe("requireSession", () => {
  beforeEach(() => {
    getUserMock.mockReset();
  });

  test("user가 null이면 ok=false, 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await requireSession();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  test("getUser가 에러를 던져도 ok=false (안전한 fallback)", async () => {
    getUserMock.mockRejectedValue(new Error("network"));
    const result = await requireSession();
    expect(result.ok).toBe(false);
  });

  test("user가 있으면 ok=true, user 정보 노출", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-123", email: "x@y.z" } },
    });
    const result = await requireSession();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe("user-123");
    }
  });
});
