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

// ── 메인 ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [loading, setLoading] = useState(true);

  const [todayChecks, setTodayChecks] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [monthSpending, setMonthSpending] = useState(0);
  const [diaryDates, setDiaryDates] = useState<Set<string>>(new Set());

  const today = new Date();
  const todayStr = localDateStr(today);
  const mStart = monthStart(todayStr);
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
          .select("amount")
          .gte("date", mStart)
          .lte("date", todayStr)
          .neq("category", "고정지출"),
      ]);

      setTotalItems(itemsRes.count ?? 0);
      setTodayChecks(checksRes.count ?? 0);
      setDiaryDates(
        new Set((diaryRes.data ?? []).map((d: { date: string }) => d.date))
      );
      setMonthSpending(
        (budgetRes.data ?? []).reduce((s, b) => s + (b.amount as number), 0),
      );
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
          {/* 배경 이미지 */}
          <Image
            src="/images/home_bg.png"
            alt="background"
            fill
            style={{ objectFit: "cover", objectPosition: "center 98%" }}
            unoptimized
          />

          {/* 캐릭터 */}
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

        {/* 달성 텍스트 */}
        <p
          style={{
            textAlign: "center",
            fontSize: 8,
            fontFamily: "'Press Start 2P', monospace",
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

      {/* ── 3. 변동지출 한 줄 ─────────────────────────────────── */}
      {!loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/rule-book.png"
            alt="가계부"
            width={18}
            height={18}
            style={{ imageRendering: "pixelated" }}
          />
          <p style={{ fontSize: 7, fontFamily: "'Press Start 2P', monospace", color: "#5a4a2a" }}>
            {month}월 변동지출 ₩{monthSpending.toLocaleString("ko-KR")}
          </p>
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

        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/rule-book.png"
                alt="일기"
                width={18}
                height={18}
                style={{ imageRendering: "pixelated" }}
              />
              <p style={{ fontSize: 7, fontFamily: "'Press Start 2P', monospace", color: "#5a4a2a" }}>
                {month}월 일기
              </p>
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
