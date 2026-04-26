"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다");
      setLoading(false);
      return;
    }

    router.push("/home");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-center min-h-full px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-[24px] font-extrabold tracking-tight">My App</h1>
          <p className="text-[13px] text-ink-muted mt-2">로그인하여 시작하기</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-2.5">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-hair-light rounded-input px-4 py-3 text-[14px] outline-none placeholder:text-ink-muted"
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-hair-light rounded-input px-4 py-3 text-[14px] outline-none placeholder:text-ink-muted"
            required
            autoComplete="current-password"
          />

          {error && (
            <p className="text-danger text-[12px] text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ink text-white rounded-input py-3 text-[14px] font-bold
              disabled:opacity-40 active:opacity-70 transition-opacity"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
