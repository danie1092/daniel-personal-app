"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const ROUTINE_POKEMON = [
  { name: "01시 취침",     pokemon_id: 143, type: "노말",     desc: "하루를 마무리하는 잠의 포켓몬. 배부르면 잔다." },
  { name: "2끼 먹기",      pokemon_id: 54,  type: "물",       desc: "두통이 심할수록 염력이 강해진다고 한다." },
  { name: "1루1메모",      pokemon_id: 85,  type: "노말/비행", desc: "세 개의 머리가 각각 다른 것을 생각한다." },
  { name: "물 2L 마시기",  pokemon_id: 7,   type: "물",       desc: "등껍질에 물을 모아 위험하면 내뿜는다." },
  { name: "스트레칭 10분", pokemon_id: 108, type: "노말",     desc: "2m나 되는 혀로 뭐든 핥아버린다." },
  { name: "오늘 일기 쓰기", pokemon_id: 3,  type: "풀/독",    desc: "꽃에서 향기가 나면 전투 준비 완료." },
  { name: "앱 가계부 입력", pokemon_id: 79, type: "물/에스퍼", desc: "매우 느리고 둔하지만 꼬리는 맛있다." },
  { name: "릴스 채집 1개", pokemon_id: 58,  type: "불꽃",     desc: "충성심이 강하고 적에게는 용감하게 짖는다." },
  { name: "칭찬 1개 찾기", pokemon_id: 113, type: "노말",     desc: "영양 만점의 알을 매일 낳는 행복의 포켓몬." },
  { name: "야외 햇빛 10분", pokemon_id: 43, type: "풀/독",    desc: "낮에는 얼굴을 땅에 묻고 밤에 돌아다닌다." },
];

type PartyItem = {
  id: string;
  name: string;
  pokemon_id: number | null;
  level: number;
  exp: number;
};

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(localDateStr(d));
  }
  return days;
}

function getEvolutionId(basePokemonId: number, level: number): number {
  const EVOLUTIONS: Record<number, { lv2: number; lv2Threshold: number; lv3?: number; lv3Threshold?: number }> = {
    1:   { lv2: 2,   lv2Threshold: 20, lv3: 3,   lv3Threshold: 40 },
    7:   { lv2: 8,   lv2Threshold: 20, lv3: 9,   lv3Threshold: 40 },
    54:  { lv2: 55,  lv2Threshold: 20 },
    79:  { lv2: 80,  lv2Threshold: 20, lv3: 199, lv3Threshold: 40 },
    84:  { lv2: 85,  lv2Threshold: 20 },
    92:  { lv2: 93,  lv2Threshold: 20, lv3: 94,  lv3Threshold: 40 },
    113: { lv2: 242, lv2Threshold: 20 },
    129: { lv2: 130, lv2Threshold: 20 },
    43:  { lv2: 44,  lv2Threshold: 20, lv3: 45,  lv3Threshold: 40 },
  };
  const evo = EVOLUTIONS[basePokemonId];
  if (!evo) return basePokemonId;
  if (evo.lv3 && level >= evo.lv3Threshold!) return evo.lv3;
  if (level >= evo.lv2Threshold) return evo.lv2;
  return basePokemonId;
}

const POKEMON_NAMES: Record<number, string> = {
  1: "bulbasaur", 2: "ivysaur", 3: "venusaur",
  7: "squirtle", 8: "wartortle", 9: "blastoise",
  43: "oddish", 44: "gloom", 45: "vileplume",
  54: "psyduck", 55: "golduck",
  58: "growlithe",
  79: "slowpoke", 80: "slowbro", 199: "slowking",
  84: "doduo", 85: "dodrio",
  92: "gastly", 93: "haunter", 94: "gengar",
  108: "lickitung",
  113: "chansey", 242: "blissey",
  129: "magikarp", 130: "gyarados",
  143: "snorlax",
};

function getSpriteUrl(pokemonId: number, level: number): string {
  const evolvedId = getEvolutionId(pokemonId, level);
  const name = POKEMON_NAMES[evolvedId] ?? "substitute";
  return `https://raw.githubusercontent.com/msikma/pokesprite/master/pokemon-gen7x/regular/${name}.png`;
}

function getRoutineMeta(name: string) {
  return ROUTINE_POKEMON.find((r) => r.name === name) ?? { type: "???", desc: "불명" };
}

const PX = "'Press Start 2P', monospace";

export default function RoutineParty() {
  const [items, setItems] = useState<PartyItem[]>([]);
  const [todayChecks, setTodayChecks] = useState<Set<string>>(new Set());
  const [weeklyChecks, setWeeklyChecks] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const todayStr = localDateStr(new Date());

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const last7 = getLast7Days();

    const [itemsRes, checksRes, weeklyRes] = await Promise.all([
      supabase
        .from("routine_items")
        .select("id, name, pokemon_id, level, exp")
        .order("sort_order", { ascending: true }),
      supabase
        .from("routine_checks")
        .select("item_id")
        .eq("date", todayStr)
        .eq("checked", true),
      supabase
        .from("routine_checks")
        .select("item_id, date")
        .in("date", last7)
        .eq("checked", true),
    ]);

    const dbItems = (itemsRes.data ?? []) as PartyItem[];

    const enriched = dbItems.map((item) => {
      if (item.pokemon_id != null) return item;
      const match = ROUTINE_POKEMON.find((r) => r.name === item.name);
      return match ? { ...item, pokemon_id: match.pokemon_id } : item;
    });

    setItems(enriched);
    setTodayChecks(
      new Set((checksRes.data ?? []).map((c: { item_id: string }) => c.item_id))
    );

    // 주간 체크 횟수 집계
    const wMap = new Map<string, number>();
    for (const c of (weeklyRes.data ?? []) as { item_id: string; date: string }[]) {
      wMap.set(c.item_id, (wMap.get(c.item_id) ?? 0) + 1);
    }
    setWeeklyChecks(wMap);
    setLoading(false);
  }, [todayStr]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div style={{ padding: "4px 0 0" }}>
        <p style={{ fontSize: 10, color: "#5a4a2a", fontFamily: PX }}>루틴 파티</p>
        <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 8, color: "#aaa", fontFamily: PX }}>Loading...</span>
        </div>
      </div>
    );
  }

  const pokemonItems = items.filter((i) => i.pokemon_id != null);
  if (pokemonItems.length === 0) return null;

  return (
    <div style={{ padding: "4px 0 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/rule-book.png" alt="" width={18} height={18} style={{ imageRendering: "pixelated" }} />
        <p style={{ fontSize: 10, color: "#5a4a2a", fontFamily: PX }}>루틴 파티</p>
      </div>

      <div
        className="scrollbar-hide"
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          paddingBottom: 4,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {pokemonItems.map((item) => {
          const checked = todayChecks.has(item.id);
          const spriteUrl = getSpriteUrl(item.pokemon_id!, item.level);
          const meta = getRoutineMeta(item.name);
          const expPct = Math.min(item.exp, 100);
          const no = String(item.pokemon_id ?? 0).padStart(3, "0");

          // HP: 최근 7일 중 체크한 날 수 * 15 (최대 100, 최소 5)
          const weekCount = weeklyChecks.get(item.id) ?? 0;
          const hp = Math.max(5, Math.min(100, weekCount * 15));
          // ATK: 레벨 기반
          const atk = Math.min(999, item.level * 10 + 5);

          return (
            <div
              key={item.id}
              style={{ flexShrink: 0, width: 115, position: "relative" }}
            >
              <div
                style={{
                  width: 115,
                  height: 142,
                  backgroundImage: "url(/images/001.png)",
                  backgroundSize: "100% 100%",
                  position: "relative",
                  imageRendering: "pixelated",
                }}
              >
                {/* 빨간 박스 — 포켓몬 이미지 */}
                <div
                  style={{
                    position: "absolute",
                    top: "11.3%",
                    left: "27%",
                    width: "46.1%",
                    height: "37.3%",
                    background: "#fff",
                    overflow: "hidden",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={spriteUrl}
                    alt={item.name}
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -80%) scale(1.5)",
                      imageRendering: "pixelated",
                      filter: checked ? "none" : "grayscale(100%) opacity(0.4)",
                      transition: "filter 0.3s",
                    }}
                  />
                </div>

                {/* 하단 텍스트 영역 */}
                <div
                  style={{
                    position: "absolute",
                    top: "53%",
                    left: "6%",
                    width: "88%",
                    height: "44%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-start",
                    padding: "2px 2px 1px",
                    overflow: "hidden",
                  }}
                >
                  {/* 이름 (센터, 2줄 허용) */}
                  <p style={{
                    fontSize: 6,
                    fontFamily: PX,
                    color: "#1a1a1a",
                    opacity: checked ? 1 : 0.4,
                    lineHeight: "1.6",
                    textAlign: "center",
                    wordBreak: "keep-all",
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    width: "100%",
                  }}>
                    {item.name}
                  </p>

                  {/* No + 타입 + Lv */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: 3, fontFamily: PX, color: "#999", opacity: checked ? 1 : 0.3 }}>
                      No.{no}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 1 }}>
                    <span style={{ fontSize: 3, fontFamily: PX, color: "#666", opacity: checked ? 1 : 0.4 }}>
                      {meta.type}
                    </span>
                    <span style={{ fontSize: 5, fontFamily: PX, color: "#1a1a1a", opacity: checked ? 1 : 0.4 }}>
                      Lv.{item.level}
                    </span>
                  </div>

                  {/* HP 바 — 주간 참여 빈도 기반 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 2 }}>
                    <span style={{ fontSize: 3, fontFamily: PX, color: "#888", width: 12, opacity: checked ? 1 : 0.4 }}>HP</span>
                    <div style={{ flex: 1, height: 3, background: "#ddd", border: "1px solid #aaa" }}>
                      <div style={{
                        width: `${hp}%`,
                        height: "100%",
                        background: hp > 50 ? "#4CAF50" : hp > 25 ? "#FF9800" : "#f44336",
                      }} />
                    </div>
                    <span style={{ fontSize: 3, fontFamily: PX, color: "#888", opacity: checked ? 1 : 0.4 }}>{hp}</span>
                  </div>

                  {/* ATK 바 — 레벨 기반 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 1 }}>
                    <span style={{ fontSize: 3, fontFamily: PX, color: "#888", width: 12, opacity: checked ? 1 : 0.4 }}>ATK</span>
                    <div style={{ flex: 1, height: 3, background: "#ddd", border: "1px solid #aaa" }}>
                      <div style={{ width: `${Math.min(atk, 100)}%`, height: "100%", background: "#f44336" }} />
                    </div>
                    <span style={{ fontSize: 3, fontFamily: PX, color: "#888", opacity: checked ? 1 : 0.4 }}>{atk}</span>
                  </div>

                  {/* EXP 바 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 1 }}>
                    <span style={{ fontSize: 3, fontFamily: PX, color: "#888", width: 12, opacity: checked ? 1 : 0.4 }}>EXP</span>
                    <div style={{ flex: 1, height: 3, background: "#ddd", border: "1px solid #aaa" }}>
                      <div style={{ width: `${expPct}%`, height: "100%", background: "#2196F3", transition: "width 0.3s" }} />
                    </div>
                    <span style={{ fontSize: 3, fontFamily: PX, color: "#888", opacity: checked ? 1 : 0.4 }}>{item.exp}/100</span>
                  </div>

                  {/* 설명 */}
                  <p style={{
                    fontSize: 3,
                    fontFamily: PX,
                    color: "#555",
                    opacity: checked ? 0.8 : 0.3,
                    lineHeight: "1.6",
                    marginTop: 2,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                  }}>
                    {meta.desc}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
