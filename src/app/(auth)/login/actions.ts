"use server";

import { createClient } from "@/lib/supabase/server";
import { checkLoginLimit } from "@/lib/rateLimit/upstash";

// 단일 사용자 앱 — 이메일/서픽스는 서버에만 둔다(클라이언트 번들에 실리지 않음).
// 화면에선 4자리 PIN만 입력하고, Supabase 비밀번호 최소길이(6)를 채우도록 서픽스로 패딩한다.
const LOGIN_EMAIL = "dlwlrma1092@gmail.com";
const PIN_SUFFIX = "-daniel-app-pin-v1";

export type PinLoginResult = { ok: true } | { ok: false; error: string };

export async function loginWithPin(pin: string): Promise<PinLoginResult> {
  if (!/^\d{4}$/.test(pin)) {
    return { ok: false, error: "4자리 숫자를 입력해주세요" };
  }

  // 1만 조합뿐이라 브루트포스 방어. Upstash 미설정 환경에선 fail-open(Supabase 자체 제한에 의존).
  const limit = await checkLoginLimit();
  if (!limit.ok) {
    return { ok: false, error: `시도가 많아요. ${limit.retryAfter}초 후 다시 시도해주세요` };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: LOGIN_EMAIL,
    password: pin + PIN_SUFFIX,
  });

  if (error) {
    return { ok: false, error: "비밀번호가 올바르지 않습니다" };
  }

  return { ok: true };
}
