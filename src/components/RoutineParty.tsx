"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const ROUTINE_POKEMON = [
  { name: "01시 취침",     pokemon_id: 143 },
  { name: "2끼 먹기",      pokemon_id: 54  },
  { name: "1루1메모",      pokemon_id: 85  },
  { name: "물 2L 마시기",  pokemon_id: 7   },
  { name: "스트레칭 10분", pokemon_id: 108 },
  { name: "오늘 일기 쓰기", pokemon_id: 3  },
  { name: "앱 가계부 입력", pokemon_id: 79 },
  { name: "릴스 채집 1개", pokemon_id: 58  },
  { name: "칭찬 1개 찾기", pokemon_id: 113 },
  { name: "야외 햇빛 10분", pokemon_id: 43 },
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

function getSpriteUrl(pokemonId: number, level: number): string {
  const evolvedId = getEvolutionId(pokemonId, level);
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-ii/gold/${evolvedId}.png`;
}

export default function RoutineParty() {
  const [items, setItems] = useState<PartyItem[]>([]);
  const [todayChecks, setTodayChecks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const todayStr = localDateStr(new Date());

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    const [itemsRes, checksRes] = await Promise.all([
      supabase
        .from("routine_items")
        .select("id, name, pokemon_id, level, exp")
        .order("sort_order", { ascending: true }),
      supabase
        .from("routine_checks")
        .select("item_id")
        .eq("date", todayStr)
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
    setLoading(false);
  }, [todayStr]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div style={{ padding: "4px 0 0" }}>
        <p style={{ fontSize: 10, color: "#5a4a2a" }}>루틴 파티</p>
        <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 8, color: "#aaa" }}>Loading...</span>
        </div>
      </div>
    );
  }

  const pokemonItems = items.filter((i) => i.pokemon_id != null);
  if (pokemonItems.length === 0) return null;

  return (
    <div style={{ padding: "4px 0 0" }}>
      <p style={{ fontSize: 10, color: "#5a4a2a", marginBottom: 12 }}>루틴 파티</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 6,
        }}
      >
        {pokemonItems.map((item) => {
          const checked = todayChecks.has(item.id);
          const spriteUrl = getSpriteUrl(item.pokemon_id!, item.level);

          return (
            /* ── card-wrapper ── */
            <div
              key={item.id}
              style={{
                position: "relative",
                height: 110,
                background: "#fff",
              }}
            >
              {/* frame overlay */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/frame001.png"
                alt=""
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "fill",
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />

              {/* ── card-content ── */}
              <div
                style={{
                  position: "relative",
                  zIndex: 2,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  padding: "8px 4px",
                  gap: 1,
                }}
              >
                {/* 포켓몬 이미지 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={spriteUrl}
                  alt={item.name}
                  width={52}
                  height={52}
                  style={{
                    imageRendering: "pixelated",
                    filter: checked ? "none" : "grayscale(100%) opacity(0.4)",
                    transition: "filter 0.3s",
                  }}
                />

                {/* 루틴명 */}
                <p
                  style={{
                    fontSize: 6,
                    color: "#1a1a1a",
                    opacity: checked ? 1 : 0.4,
                    textAlign: "center",
                    lineHeight: "1.3",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    width: "100%",
                  }}
                >
                  {item.name}
                </p>

                {/* 레벨 */}
                <p
                  style={{
                    fontSize: 6,
                    color: "#1a1a1a",
                    opacity: checked ? 1 : 0.4,
                  }}
                >
                  Lv.{item.level}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
