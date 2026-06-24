"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithPin } from "./actions";

export const dynamic = "force-dynamic";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const router = useRouter();

  const submit = useCallback(
    async (value: string) => {
      setLoading(true);
      const res = await loginWithPin(value);
      if (!res.ok) {
        setError(res.error);
        setShake(true);
        setLoading(false);
        setTimeout(() => {
          setPin("");
          setShake(false);
        }, 450);
        return;
      }
      router.replace("/home");
      router.refresh();
    },
    [router]
  );

  const press = useCallback(
    (digit: string) => {
      setError("");
      setPin((prev) => {
        if (prev.length >= 4) return prev;
        const next = prev + digit;
        if (next.length === 4) submit(next);
        return next;
      });
    },
    [submit]
  );

  const back = useCallback(() => {
    setError("");
    setPin((prev) => prev.slice(0, -1));
  }, []);

  // 데스크톱 하드웨어 키보드도 지원
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (loading) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, press, back]);

  return (
    <div className="flex flex-col min-h-full max-w-md mx-auto px-6 pt-24 pb-10">
      {/* 상단: 타이틀 + 점 + 에러 */}
      <div className="flex-1 flex flex-col items-center">
        <h1 className="text-[19px] font-extrabold tracking-tight text-ink">
          비밀번호를 입력해주세요
        </h1>
        <p className="text-[13px] text-ink-muted mt-2">My App</p>

        <div
          className={`flex gap-4 mt-12 ${shake ? "animate-pin-shake" : ""}`}
          aria-label={`${pin.length}자리 입력됨`}
        >
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`w-3.5 h-3.5 rounded-full transition-colors duration-150 ${
                i < pin.length ? "bg-ink" : "bg-hair"
              }`}
            />
          ))}
        </div>

        <p className="text-danger text-[12px] mt-4 h-4">{error}</p>
      </div>

      {/* 하단: 숫자 키패드 */}
      <div className="grid grid-cols-3 gap-x-6 gap-y-2">
        {KEYS.map((key, i) => {
          if (key === "") return <span key={i} />;
          if (key === "back") {
            return (
              <button
                key={i}
                type="button"
                onClick={back}
                disabled={loading}
                aria-label="지우기"
                className="h-16 flex items-center justify-center text-ink-sub
                  rounded-full active:bg-hair-light transition-colors disabled:opacity-40"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 4H8l-7 8 7 8h13a1 1 0 001-1V5a1 1 0 00-1-1z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              </button>
            );
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => press(key)}
              disabled={loading}
              className="h-16 flex items-center justify-center text-[26px] font-semibold text-ink
                rounded-full active:bg-hair-light transition-colors disabled:opacity-40"
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
