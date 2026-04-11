"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { playCheckSound } from "@/lib/acSound";
type Tab = "체크" | "그래프" | "설정";

type RoutineItem = {
  id: string;
  name: string;
  emoji: string;
  sort_order: number;
  pokemon_id: number | null;
  level: number;
  exp: number;
};

type DayStat = {
  date: string;
  label: string;
  count: number;
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function localDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getLast(n: number, from: Date): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() - (n - 1 - i));
    return localDateStr(d);
  });
}

// ── 꺾은선 그래프 ───────────────────────────────────────────
function LineChart({ stats, todayStr, maxY }: { stats: DayStat[]; todayStr: string; maxY: number }) {
  const W = 300;
  const H = 120;
  const padL = 22;
  const padR = 8;
  const padT = 10;
  const padB = 20;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = stats.length;
  const safeMax = maxY > 0 ? maxY : 1;

  const xOf = (i: number) => padL + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
  const yOf = (v: number) => padT + chartH - (v / safeMax) * chartH;

  const pathD = stats
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xOf(i)} ${yOf(d.count)}`)
    .join(" ");

  const yTicks = [0, Math.round(safeMax / 2), safeMax].filter(
    (v, i, a) => a.indexOf(v) === i
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* Y 격자선 */}
      {yTicks.map((v) => {
        const y = yOf(v);
        return (
          <g key={v}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#f0f0f0" strokeWidth="1" />
            <text x={padL - 4} y={y + 3.5} textAnchor="end" fontSize="8" fill="#d1d5db">{v}</text>
          </g>
        );
      })}

      {/* 선 */}
      {n > 1 && (
        <path d={pathD} fill="none" stroke="#000" strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />
      )}

      {/* 점 + X 레이블 */}
      {stats.map((d, i) => {
        const x = xOf(i);
        const y = yOf(d.count);
        const isToday = d.date === todayStr;
        const showLabel = n <= 7 || i === 0 || i === n - 1 || i % 5 === 4;
        return (
          <g key={d.date}>
            {showLabel && (
              <text x={x} y={H - 4} textAnchor="middle" fontSize="8"
                fill={isToday ? "#000" : "#9ca3af"}
                fontWeight={isToday ? "600" : "400"}
              >{d.label}</text>
            )}
            <circle cx={x} cy={y} r={isToday ? 4 : 3}
              fill={isToday ? "#000" : "#fff"}
              stroke="#000" strokeWidth="1.5"
            />
          </g>
        );
      })}
    </svg>
  );
}

// ── 메인 페이지 ─────────────────────────────────────────────
export default function RoutinePage() {
  const today = new Date();
  const todayStr = localDateStr(today);
  const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;
  const dayStr = DAY_LABELS[today.getDay()] + "요일";

  const [activeTab, setActiveTab] = useState<Tab>("체크");

  // ── 체크 탭 state
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [todayChecks, setTodayChecks] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [itemsLoading, setItemsLoading] = useState(true);

  // ── 그래프 탭 state
  const [graphView, setGraphView] = useState<"주간" | "월간">("주간");
  const [weeklyStats, setWeeklyStats] = useState<DayStat[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<DayStat[]>([]);
  const [streaks, setStreaks] = useState<{ item: RoutineItem; streak: number }[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);

  // ── 설정 탭 state
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("✅");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");

  // ── fetch 함수들
  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from("routine_items")
      .select("*")
      .order("sort_order", { ascending: true });
    setItems((data as RoutineItem[]) ?? []);
    setItemsLoading(false);
  }, []);

  const fetchTodayChecks = useCallback(async () => {
    const { data } = await supabase
      .from("routine_checks")
      .select("item_id")
      .eq("date", todayStr)
      .eq("checked", true);
    setTodayChecks(new Set((data ?? []).map((c: { item_id: string }) => c.item_id)));
  }, [todayStr]);

  useEffect(() => {
    fetchItems();
    fetchTodayChecks();
  }, [fetchItems, fetchTodayChecks]);

  // 그래프 탭 진입 시 데이터 fetch
  useEffect(() => {
    if (activeTab !== "그래프" || items.length === 0) return;

    async function fetchGraph() {
      setGraphLoading(true);
      const dates30 = getLast(30, today);
      const startStr = dates30[0];

      const { data: checks } = await supabase
        .from("routine_checks")
        .select("item_id, date")
        .gte("date", startStr)
        .lte("date", todayStr)
        .eq("checked", true);

      const checkList = (checks ?? []) as { item_id: string; date: string }[];

      const buildStats = (dates: string[], labelFn: (d: Date) => string): DayStat[] =>
        dates.map((date) => {
          const d = new Date(date + "T00:00:00");
          const cnt = checkList.filter((c) => c.date === date).length;
          return { date, label: labelFn(d), count: cnt };
        });

      setWeeklyStats(buildStats(getLast(7, today), (d) => DAY_LABELS[d.getDay()]));
      setMonthlyStats(buildStats(dates30, (d) => String(d.getDate())));

      // 연속 달성 계산 (오늘 포함, 뒤로 탐색)
      const checkSet = new Set(checkList.map((c) => `${c.item_id}_${c.date}`));
      const itemStreaks = items.map((item) => {
        let streak = 0;
        const d = new Date(today);
        for (let i = 0; i < 365; i++) {
          if (checkSet.has(`${item.id}_${localDateStr(d)}`)) {
            streak++;
            d.setDate(d.getDate() - 1);
          } else break;
        }
        return { item, streak };
      });
      setStreaks(itemStreaks.sort((a, b) => b.streak - a.streak));
      setGraphLoading(false);
    }

    fetchGraph();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, items]);

  // ── 체크 토글 (낙관적 업데이트 + 자동저장)
  async function toggleCheck(itemId: string) {
    if (toggling.has(itemId)) return;
    setToggling((prev) => new Set([...prev, itemId]));

    const wasChecked = todayChecks.has(itemId);
    setTodayChecks((prev) => {
      const next = new Set(prev);
      wasChecked ? next.delete(itemId) : next.add(itemId);
      return next;
    });

    if (wasChecked) {
      await supabase.from("routine_checks")
        .delete()
        .eq("item_id", itemId)
        .eq("date", todayStr);
    } else {
      await supabase.from("routine_checks").upsert(
        { item_id: itemId, date: todayStr, checked: true },
        { onConflict: "item_id,date" }
      );
      playCheckSound();

      // EXP +10, 레벨업 처리
      const item = items.find((i) => i.id === itemId);
      if (item && item.pokemon_id != null) {
        let newExp = item.exp + 10;
        let newLevel = item.level;
        if (newExp >= 100) {
          newExp -= 100;
          newLevel += 1;
        }
        await supabase
          .from("routine_items")
          .update({ exp: newExp, level: newLevel })
          .eq("id", itemId);
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId ? { ...i, exp: newExp, level: newLevel } : i
          )
        );
      }
    }

    setToggling((prev) => { const s = new Set(prev); s.delete(itemId); return s; });
  }

  // ── 설정: 추가
  async function handleAddItem() {
    if (!newName.trim()) return;
    const maxOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
    await supabase.from("routine_items").insert({
      name: newName.trim(),
      emoji: newEmoji.trim() || "✅",
      sort_order: maxOrder,
    });
    setNewName("");
    setNewEmoji("✅");
    await fetchItems();
  }

  // ── 설정: 수정 저장
  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return;
    await supabase.from("routine_items")
      .update({ name: editName.trim(), emoji: editEmoji.trim() || "✅" })
      .eq("id", id);
    setEditingId(null);
    await fetchItems();
  }

  // ── 설정: 삭제
  async function handleDeleteItem(id: string) {
    await supabase.from("routine_items").delete().eq("id", id);
    await fetchItems();
  }

  // ── 설정: 순서 이동
  async function moveItem(index: number, dir: "up" | "down") {
    const swapIdx = dir === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const a = items[index];
    const b = items[swapIdx];
    await Promise.all([
      supabase.from("routine_items").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("routine_items").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    await fetchItems();
  }

  const checkedCount = todayChecks.size;
  const totalCount = items.length;
  const pct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* 상단 탭 */}
      <div className="flex border-b border-gray-100 bg-white sticky top-0 z-10">
        {(["체크", "그래프", "설정"] as Tab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm transition-colors ${
              activeTab === tab ? "text-black border-b-2 border-black font-medium" : "text-gray-400"
            }`}
          >{tab}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ════════════ 체크 탭 ════════════ */}
        {activeTab === "체크" && (
          <>
            {/* 헤더 */}
            <div className="px-4 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold leading-none">루틴</h1>
                <p className="text-xs text-gray-400 mt-0.5">{dateStr} {dayStr}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative w-9 h-9">
                  <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#f3f4f6" strokeWidth="4" />
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#000" strokeWidth="4"
                      strokeDasharray={`${2 * Math.PI * 14}`}
                      strokeDashoffset={`${2 * Math.PI * 14 * (1 - pct / 100)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold">
                    {pct}%
                  </span>
                </div>
                <span className="text-xs text-gray-400">{checkedCount}/{totalCount}</span>
              </div>
            </div>

            {itemsLoading ? (
              <p className="text-center text-gray-300 text-xs py-16">불러오는 중...</p>
            ) : items.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-300 text-sm mb-1">루틴 항목이 없어요</p>
                <button onClick={() => setActiveTab("설정")}
                  className="text-xs text-gray-400 underline mt-1">
                  설정에서 추가하기
                </button>
              </div>
            ) : (
              <div>
                {items.map((item, i) => {
                  const checked = todayChecks.has(item.id);
                  return (
                    <button key={item.id}
                      onClick={() => toggleCheck(item.id)}
                      disabled={toggling.has(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                        i < items.length - 1 ? "border-b border-gray-100" : ""
                      } ${checked ? "bg-gray-50" : "bg-white"} active:bg-gray-50 disabled:opacity-60`}
                    >
                      <span className="text-2xl leading-none w-8 text-center">{item.emoji}</span>
                      <span className={`flex-1 text-sm font-medium transition-all ${
                        checked ? "text-gray-300 line-through" : "text-black"
                      }`}>
                        {item.name}
                      </span>
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        checked ? "bg-black border-black" : "border-gray-300"
                      }`}>
                        {checked && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                    </button>
                  );
                })}

                {/* 전체 완료 메시지 */}
                {checkedCount === totalCount && totalCount > 0 && (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-400">오늘 루틴 완료! 🎉</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ════════════ 그래프 탭 ════════════ */}
        {activeTab === "그래프" && (
          <div className="px-4 py-5 flex flex-col gap-6">
            {/* 주간/월간 토글 */}
            <div className="flex bg-gray-100 rounded-xl p-1">
              {(["주간", "월간"] as const).map((v) => (
                <button key={v} onClick={() => setGraphView(v)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    graphView === v ? "bg-white text-black shadow-sm" : "text-gray-500"
                  }`}
                >{v}</button>
              ))}
            </div>

            {items.length === 0 ? (
              <p className="text-center text-gray-300 text-xs py-8">설정에서 루틴 항목을 추가해주세요</p>
            ) : graphLoading ? (
              <p className="text-center text-gray-300 text-xs py-8">불러오는 중...</p>
            ) : (
              <>
                {/* 달성 개수 꺾은선 */}
                <div>
                  <p className="text-[11px] text-gray-400 mb-4">
                    {graphView === "주간" ? "최근 7일 달성 개수" : "최근 30일 달성 개수"}
                  </p>
                  <LineChart
                    stats={graphView === "주간" ? weeklyStats : monthlyStats}
                    todayStr={todayStr}
                    maxY={items.length}
                  />
                </div>

                {/* 연속 달성 */}
                <div>
                  <p className="text-[11px] text-gray-400 mb-3">연속 달성</p>
                  <div className="flex flex-col">
                    {streaks.map(({ item, streak }, i) => (
                      <div key={item.id}
                        className={`flex items-center gap-3 py-2.5 ${
                          i < streaks.length - 1 ? "border-b border-gray-50" : ""
                        }`}
                      >
                        <span className="text-lg leading-none w-7 text-center">{item.emoji}</span>
                        <span className="text-sm flex-1">{item.name}</span>
                        {streak > 0 ? (
                          <div className="flex items-center gap-1">
                            <span className="text-base">🔥</span>
                            <span className="text-sm font-medium">{streak}일</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-200">—</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════════ 설정 탭 ════════════ */}
        {activeTab === "설정" && (
          <div className="flex flex-col">
            {/* 새 항목 추가 폼 */}
            <div className="px-4 py-4 border-b border-gray-100">
              <p className="text-[11px] text-gray-400 mb-3">새 항목 추가</p>
              <div className="flex gap-2">
                <input
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  placeholder="✅"
                  maxLength={2}
                  className="w-12 bg-gray-50 rounded-xl text-center text-xl outline-none py-2 flex-shrink-0"
                />
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddItem(); }}
                  placeholder="항목 이름"
                  className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none placeholder:text-gray-300"
                />
                <button
                  onClick={handleAddItem}
                  disabled={!newName.trim()}
                  className="px-3 py-2 bg-black text-white rounded-xl text-sm font-medium disabled:opacity-30 active:opacity-70"
                >추가</button>
              </div>
            </div>

            {/* 항목 목록 */}
            {itemsLoading ? (
              <p className="text-center text-gray-300 text-xs py-12">불러오는 중...</p>
            ) : items.length === 0 ? (
              <p className="text-center text-gray-300 text-xs py-12">항목을 추가해주세요</p>
            ) : (
              items.map((item, i) => (
                <div key={item.id}
                  className={`px-4 py-3 ${i < items.length - 1 ? "border-b border-gray-100" : ""}`}
                >
                  {editingId === item.id ? (
                    /* 수정 모드 */
                    <div className="flex gap-2">
                      <input value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)}
                        maxLength={2}
                        className="w-12 bg-gray-50 rounded-xl text-center text-xl outline-none py-2 flex-shrink-0"
                      />
                      <input value={editName} onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(item.id); }}
                        className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none"
                      />
                      <button onClick={() => handleSaveEdit(item.id)}
                        className="px-3 py-2 bg-black text-white rounded-xl text-xs font-medium active:opacity-70"
                      >저장</button>
                      <button onClick={() => setEditingId(null)}
                        className="px-3 py-2 bg-gray-100 text-gray-500 rounded-xl text-xs active:opacity-70"
                      >취소</button>
                    </div>
                  ) : (
                    /* 표시 모드 */
                    <div className="flex items-center gap-2">
                      <span className="text-xl leading-none w-7 text-center flex-shrink-0">{item.emoji}</span>
                      <span className="text-sm flex-1">{item.name}</span>
                      {/* 순서 */}
                      <button onClick={() => moveItem(i, "up")} disabled={i === 0}
                        className="text-gray-300 disabled:opacity-20 w-7 text-center active:opacity-60 text-base"
                      >↑</button>
                      <button onClick={() => moveItem(i, "down")} disabled={i === items.length - 1}
                        className="text-gray-300 disabled:opacity-20 w-7 text-center active:opacity-60 text-base"
                      >↓</button>
                      {/* 수정 */}
                      <button
                        onClick={() => { setEditingId(item.id); setEditName(item.name); setEditEmoji(item.emoji); }}
                        className="text-xs text-gray-400 px-2 py-1 active:opacity-60"
                      >수정</button>
                      {/* 삭제 */}
                      <button onClick={() => handleDeleteItem(item.id)}
                        className="text-xs text-red-400 px-1 py-1 active:opacity-60"
                      >삭제</button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}
