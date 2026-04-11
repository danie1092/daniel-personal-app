"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import RoutineParty from "@/components/RoutineParty";

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStart(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01";
}

function weekStart(d: Date): string {
  const w = new Date(d);
  w.setDate(w.getDate() - w.getDay()); // 일요일 시작
  return localDateStr(w);
}

function getSpendingComment(amount: number, budget: number): string {
  if (amount === 0) return "무지출 챌린지!";
  const pct = amount / budget;
  if (pct <= 0.3) return "이번달도 아껴쓰자!";
  if (pct <= 0.6) return "슬슬 조심해야겠는걸";
  if (pct <= 0.85) return "좀만 더 아끼자...!";
  if (pct <= 1.0) return "미쳤냐?";
  return "거지가 되고싶냐?";
}

const PX = "'Press Start 2P', monospace";
const MONTHLY_BUDGET = 2_000_000;
const WEEKLY_BUDGET = 500_000;
const DAILY_BUDGET = 50_000;

// ── 메인 ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [loading, setLoading] = useState(true);

  const [todayChecks, setTodayChecks] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [todaySpending, setTodaySpending] = useState(0);
  const [weekSpending, setWeekSpending] = useState(0);
  const [monthSpending, setMonthSpending] = useState(0);
  const [diaryDates, setDiaryDates] = useState<Set<string>>(new Set());

  const today = new Date();
  const todayStr = localDateStr(today);
  const mStart = monthStart(todayStr);
  const wStart = weekStart(today);
  const month = today.getMonth() + 1;

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
          .select("date")
          .gte("date", mStart)
          .lte("date", todayStr),
        supabase
          .from("budget_entries")
          .select("amount, date")
          .gte("date", mStart)
          .lte("date", todayStr)
          .neq("category", "고정지출"),
      ]);

      setTotalItems(itemsRes.count ?? 0);
      setTodayChecks(checksRes.count ?? 0);
      setDiaryDates(
        new Set((diaryRes.data ?? []).map((d: { date: string }) => d.date))
      );

      const entries = (budgetRes.data ?? []) as { amount: number; date: string }[];
      setTodaySpending(entries.filter((e) => e.date === todayStr).reduce((s, e) => s + e.amount, 0));
      setWeekSpending(entries.filter((e) => e.date >= wStart).reduce((s, e) => s + e.amount, 0));
      setMonthSpending(entries.reduce((s, e) => s + e.amount, 0));
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const routinePct = totalItems > 0 ? Math.round((todayChecks / totalItems) * 100) : 0;

  return (
    <div
      className="flex flex-col h-full overflow-y-auto px-5 pt-6 pb-10 gap-4"
      style={{ background: "#f7f5f2" }}
    >
      {/* ── 1. 루틴 달성 러닝 카드 ────────────────────────────── */}
      <div>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 120,
            borderRadius: 20,
            overflow: "hidden",
            border: "1px solid #f0ede8",
          }}
        >
          <Image
            src="/images/home_bg.png"
            alt="background"
            fill
            style={{ objectFit: "cover", objectPosition: "center 98%" }}
            unoptimized
          />
          <div
            style={{
              position: "absolute",
              bottom: "28%",
              left: `${loading ? 5 : 5 + (routinePct / 100) * 60}%`,
              transition: "left 0.8s ease-out",
              transform: "translateX(-50%)",
              zIndex: 1,
              pointerEvents: "none",
            }}
          >
            <Image
              src="/images/kitty.png"
              alt="kitty"
              width={40}
              height={40}
              style={{ imageRendering: "pixelated" }}
              unoptimized
            />
          </div>
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: 8,
            fontFamily: PX,
            color: "#5a4a2a",
            marginTop: 6,
            lineHeight: "1.8",
          }}
        >
          {loading
            ? "..."
            : routinePct === 0
              ? "아직 집에 돌아가지 않았다... 루틴을 시작하자!"
              : routinePct < 50
                ? `다니엘은 집을 향해 걷고 있다... (${todayChecks}/${totalItems})`
                : routinePct < 100
                  ? `다니엘의 발걸음이 빨라졌다! (${todayChecks}/${totalItems})`
                  : "다니엘이 집에 돌아왔다! ★"}
        </p>
      </div>

      {/* ── 2. 루틴 파티 ───────────────────────────────────────── */}
      <RoutineParty />

      <div style={{ borderTop: "1px dashed #d0ccc7" }} />

      {/* ── 3. 지출 내역 ──────────────────────────────────────── */}
      {!loading && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/rule-book.png" alt="가계부" width={18} height={18} style={{ imageRendering: "pixelated" }} />
            <p style={{ fontSize: 8, fontFamily: PX, color: "#5a4a2a" }}>
              {month}월 지출 내역
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 24 }}>
            {/* 오늘 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 6, fontFamily: PX, color: "#5a4a2a" }}>오늘</span>
                <span style={{ fontSize: 7, fontFamily: PX, color: "#1a1a1a" }}>
                  ₩{todaySpending.toLocaleString("ko-KR")}
                </span>
              </div>
              <span style={{ fontSize: 5, fontFamily: PX, color: "#888" }}>
                {getSpendingComment(todaySpending, DAILY_BUDGET)}
              </span>
            </div>

            {/* 이번주 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 6, fontFamily: PX, color: "#5a4a2a" }}>이번주</span>
                <span style={{ fontSize: 7, fontFamily: PX, color: "#1a1a1a" }}>
                  ₩{weekSpending.toLocaleString("ko-KR")}
                </span>
              </div>
              <span style={{ fontSize: 5, fontFamily: PX, color: "#888" }}>
                {getSpendingComment(weekSpending, WEEKLY_BUDGET)}
              </span>
            </div>

            {/* 이번달 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 6, fontFamily: PX, color: "#5a4a2a" }}>이번달</span>
                <span style={{ fontSize: 7, fontFamily: PX, color: "#1a1a1a" }}>
                  ₩{monthSpending.toLocaleString("ko-KR")}
                </span>
              </div>
              <span style={{ fontSize: 5, fontFamily: PX, color: monthSpending / MONTHLY_BUDGET > 0.85 ? "#d32f2f" : "#888" }}>
                {getSpendingComment(monthSpending, MONTHLY_BUDGET)}
              </span>
            </div>
          </div>
        </div>
      )}

      <div style={{ borderTop: "1px dashed #d0ccc7" }} />

      {/* ── 4. 일기 잔디 (egg 히트맵) ────────────────────────── */}
      {!loading && (() => {
        const year = today.getFullYear();
        const m = today.getMonth();
        const daysInMonth = new Date(year, m + 1, 0).getDate();
        const days = Array.from({ length: daysInMonth }, (_, i) => {
          const d = new Date(year, m, i + 1);
          return localDateStr(d);
        });
        const todayDate = today.getDate();
        const wroteCount = days.filter((d) => diaryDates.has(d)).length;
        const passedDays = todayDate;
        const diaryPct = passedDays > 0 ? wroteCount / passedDays : 0;
        const diaryComment = wroteCount === 0
          ? "펜을 들어보자..."
          : diaryPct >= 0.8
            ? "꾸준한 기록왕!"
            : diaryPct >= 0.5
              ? "절반은 넘었다!"
              : diaryPct >= 0.3
                ? "조금만 더 써보자"
                : "알들이 외로워하고 있어";

        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/rule-book.png" alt="일기" width={18} height={18} style={{ imageRendering: "pixelated" }} />
              <p style={{ fontSize: 8, fontFamily: PX, color: "#5a4a2a" }}>
                {month}월 일기
              </p>
              <span style={{ fontSize: 5, fontFamily: PX, color: "#888", marginLeft: "auto" }}>
                {wroteCount}/{passedDays}일 {diaryComment}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {days.map((dateStr, i) => {
                const dayNum = i + 1;
                const isFuture = dayNum > todayDate;
                const wrote = diaryDates.has(dateStr);

                return (
                  <div
                    key={dateStr}
                    style={{
                      position: "relative",
                      width: 24,
                      height: 24,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/mystery-egg.png"
                      alt={`${dayNum}일`}
                      width={24}
                      height={24}
                      style={{
                        imageRendering: "pixelated",
                        filter: isFuture
                          ? "grayscale(100%) opacity(0.15)"
                          : wrote
                            ? "none"
                            : "grayscale(100%) opacity(0.35)",
                        transition: "filter 0.3s",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
