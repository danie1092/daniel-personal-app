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
  const [hasDiary, setHasDiary] = useState(false);

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

        {/* 달성 텍스트 — 포켓몬 골드 대화창 */}
        <div
          style={{
            backgroundImage: "url(/images/frame002.png)",
            backgroundSize: "100% 100%",
            backgroundColor: "transparent",
            border: "none",
            outline: "none",
            padding: "12px 20px",
            marginTop: 8,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 9, color: "#1a1a1a", lineHeight: "1.8" }}>
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
      </div>

      {/* ── 2. 루틴 파티 ───────────────────────────────────────── */}
      <RoutineParty />

      {/* ── 3. 하단 2열 미니 카드 (하늘색) ────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* 변동지출 */}
        <div
          style={{
            background: "#a8d8f0",
            borderRadius: 0,
            padding: "16px 18px",
            border: "3px solid #1a1a1a",
            boxShadow: "3px 3px 0px #1a1a1a",
            outline: "2px solid #1a1a1a",
            outlineOffset: "-5px",
          }}
        >
          <p style={{ fontSize: 7, color: "#1a1a1a", marginBottom: 10 }}>
            이번달 변동지출
          </p>
          {loading ? (
            <div style={{ height: 24, width: 96, background: "#8ec8e0", borderRadius: 0 }} />
          ) : (
            <p style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>
              ₩{monthSpending.toLocaleString("ko-KR")}
            </p>
          )}
          <p style={{ fontSize: 7, color: "#2a4a5a", marginTop: 6 }}>{month}월 누계</p>
        </div>

        {/* 일기 */}
        <div
          style={{
            background: "#a8d8f0",
            borderRadius: 0,
            padding: "16px 18px",
            border: "3px solid #1a1a1a",
            boxShadow: "3px 3px 0px #1a1a1a",
            outline: "2px solid #1a1a1a",
            outlineOffset: "-5px",
          }}
        >
          <p style={{ fontSize: 7, color: "#1a1a1a", marginBottom: 10 }}>
            오늘 일기
          </p>
          {loading ? (
            <div style={{ height: 24, width: 64, background: "#8ec8e0", borderRadius: 0 }} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 20 }}>{hasDiary ? "📖" : "📝"}</span>
              <span
                style={{
                  fontSize: 10,
                  color: hasDiary ? "#1a5a1a" : "#4a4a4a",
                }}
              >
                {hasDiary ? "작성 완료" : "미작성"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
