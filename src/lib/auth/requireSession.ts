import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email?: string | null };

export type RequireSessionResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: Response };

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * 현재 요청의 Supabase 세션을 검증한다.
 * - 세션 없거나 getUser가 throw하면 401
 * - 세션 있으면 ok=true + user 정보 반환
 */
export async function requireSession(): Promise<RequireSessionResult> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      return { ok: false, response: unauthorized() };
    }
    return {
      ok: true,
      user: { id: data.user.id, email: data.user.email ?? null },
    };
  } catch {
    return { ok: false, response: unauthorized() };
  }
}
