"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

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
          <h1 className="text-2xl font-medium tracking-tight">My App</h1>
          <p className="text-sm text-gray-400 mt-2">로그인하여 시작하기</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-3">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ios-input"
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="ios-input"
            required
            autoComplete="current-password"
          />

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white rounded-xl py-3 text-base font-medium
              disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
