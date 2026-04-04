"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStart(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01";
}

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

// ── 카드 컴포넌트 ─────────────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [loading, setLoading] = useState(true);

  const [todayChecks, setTodayChecks]     = useState(0);
  const [totalItems, setTotalItems]       = useState(0);
  const [monthSpending, setMonthSpending] = useState(0);
  const [hasDiary, setHasDiary]           = useState(false);

  const today    = new Date();
  const todayStr = localDateStr(today);
  const mStart   = monthStart(todayStr);

  useEffect(() => {
    async function load() {
      const [itemsRes, checksRes, diaryRes, budgetRes] = await Promise.all([
        supabase.from("routine_items").select("id", { count: "exact", head: true }),
        supabase
          .from("routine_checks")
          .select("id", { count: "exact", head: true })
          .eq("date", todayStr)
          .eq("checked", true),
        supabase
          .from("diary_entries")
          .select("id", { count: "exact", head: true })
          .eq("date", todayStr),
        supabase
          .from("budget_entries")
          .select("amount")
          .gte("date", mStart)
          .lte("date", todayStr)
          .neq("category", "고정지출"),
      ]);

      setTotalItems(itemsRes.count ?? 0);
      setTodayChecks(checksRes.count ?? 0);
      setHasDiary((diaryRes.count ?? 0) > 0);
      setMonthSpending(
        (budgetRes.data ?? []).reduce((s, b) => s + (b.amount as number), 0)
      );
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const routinePct = totalItems > 0 ? Math.round((todayChecks / totalItems) * 100) : 0;

  const month    = today.getMonth() + 1;
  const date     = today.getDate();
  const dayLabel = DAY_KO[today.getDay()];

  return (
    <div className="flex flex-col h-full overflow-y-auto px-5 pt-6 pb-10 gap-5">

      {/* ── 날짜 헤더 ─────────────────────────────────────────────── */}
      <div>
        <p className="text-[13px] text-gray-400 font-medium">
          {month}월 {date}일 {dayLabel}요일
        </p>
        <h1 className="text-2xl font-semibold mt-0.5 text-gray-900">
          {hasDiary ? "오늘도 수고했어요 ✨" : "오늘 하루 어떠셨나요?"}
        </h1>
      </div>

      {/* ── 루틴 카드 ─────────────────────────────────────────────── */}
      <Card>
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">✅</span>
              <span className="text-sm font-medium text-gray-700">오늘 루틴</span>
            </div>
            {loading ? (
              <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
            ) : (
              <span className="text-sm font-semibold text-gray-900">
                {todayChecks}
                <span className="text-gray-400 font-normal"> / {totalItems}</span>
              </span>
            )}
          </div>
          {/* 진행 바 */}
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: loading ? "0%" : `${routinePct}%`,
                background: routinePct === 100
                  ? "linear-gradient(90deg, #34d399, #10b981)"
                  : "linear-gradient(90deg, #a78bfa, #818cf8)",
              }}
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5 text-right">
            {loading ? "" : routinePct === 100 ? "모두 완료!" : `${routinePct}% 달성`}
          </p>
        </div>
      </Card>

      {/* ── 이번달 지출 + 일기 (2열) ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">

        {/* 변동지출 */}
        <Card>
          <div className="px-4 py-4">
            <p className="text-[11px] text-gray-400 font-medium mb-2">이번달 변동지출</p>
            {loading ? (
              <div className="h-6 w-24 bg-gray-100 rounded animate-pulse" />
            ) : (
              <p className="text-lg font-bold text-gray-900">
                ₩{monthSpending.toLocaleString("ko-KR")}
              </p>
            )}
            <p className="text-[10px] text-gray-300 mt-1">{month}월 누계</p>
          </div>
        </Card>

        {/* 일기 */}
        <Card>
          <div className="px-4 py-4">
            <p className="text-[11px] text-gray-400 font-medium mb-2">오늘 일기</p>
            {loading ? (
              <div className="h-6 w-16 bg-gray-100 rounded animate-pulse" />
            ) : (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xl">{hasDiary ? "📖" : "📝"}</span>
                <span
                  className={`text-sm font-semibold ${hasDiary ? "text-emerald-500" : "text-gray-400"}`}
                >
                  {hasDiary ? "작성 완료" : "미작성"}
                </span>
              </div>
            )}
          </div>
        </Card>

      </div>

    </div>
  );
}
