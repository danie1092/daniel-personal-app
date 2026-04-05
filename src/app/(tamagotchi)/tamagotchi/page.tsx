"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useTamagotchi } from "@/hooks/useTamagotchi";

const CANVAS_SIZE = 128;
const FRAME_W = 32;
const FRAME_H = 50;
const FRAME_INTERVAL = 600;

// Background tile: 4th tile in Backgrounds - Sanrio.png
const BG_TILE_X = 391;
const BG_TILE_Y = 1;
const BG_TILE_SIZE = 128;

// Kiraritchi row (y=36~85)
const CHAR_ROW_Y = 36;

// Animation frame sets by mood
const FRAMES_IDLE = [13, 14, 15, 16];
const FRAMES_HAPPY = [3, 6];
const FRAMES_HUNGRY = [9, 12];
const FRAMES_SICK = [17, 13];

const MENU_ITEMS = [
  { icon: "🍚", label: "밥" },
  { icon: "💡", label: "불" },
  { icon: "🎮", label: "놀이" },
  { icon: "💊", label: "약" },
  { icon: "🚿", label: "화장실" },
  { icon: "📊", label: "상태" },
];

type Mood = "sick" | "hungry" | "happy" | "idle";

function getMood(hunger: number, happy: number, sick: boolean): Mood {
  if (sick) return "sick";
  if (hunger === 0) return "hungry";
  if (happy >= 6) return "happy";
  return "idle";
}

const MOOD_FRAMES: Record<Mood, number[]> = {
  idle: FRAMES_IDLE,
  happy: FRAMES_HAPPY,
  hungry: FRAMES_HUNGRY,
  sick: FRAMES_SICK,
};

// Stage label by age
function getStage(age: number): string {
  if (age < 1) return "베이비";
  if (age < 3) return "유아기";
  if (age < 7) return "성장기";
  return "성인기";
}

export default function TamagotchiPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const charImgRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef(0);
  const moodRef = useRef<Mood>("idle");
  const framesRef = useRef(FRAMES_IDLE);
  const poopRef = useRef(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [blinkOn, setBlinkOn] = useState(true);

  const { state, loading, feed, play, cleanPoop, heal } = useTamagotchi();

  // Blink timer for critical stats
  useEffect(() => {
    const interval = setInterval(() => setBlinkOn((v) => !v), 500);
    return () => clearInterval(interval);
  }, []);

  // Update frame set when mood changes
  useEffect(() => {
    if (!state) return;
    const mood = getMood(state.hunger, state.happy, state.sick);
    if (mood !== moodRef.current) {
      moodRef.current = mood;
      framesRef.current = MOOD_FRAMES[mood];
      frameRef.current = 0;
    }
    poopRef.current = state.poop;
  }, [state]);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    // Draw background tile
    if (bgImgRef.current) {
      ctx.drawImage(
        bgImgRef.current,
        BG_TILE_X, BG_TILE_Y, BG_TILE_SIZE, BG_TILE_SIZE,
        0, 0, CANVAS_SIZE, CANVAS_SIZE
      );
    }

    // Draw character frame centered on canvas
    const frames = framesRef.current;
    if (charImgRef.current && frames.length > 0) {
      const sx = frames[frameRef.current % frames.length] * FRAME_W;
      const sy = CHAR_ROW_Y;
      const dx = Math.floor((CANVAS_SIZE - FRAME_W) / 2);
      const dy = CANVAS_SIZE - FRAME_H - 4;
      ctx.drawImage(
        charImgRef.current,
        sx, sy, FRAME_W, FRAME_H,
        dx, dy, FRAME_W, FRAME_H
      );
    }

    // Draw poop icons at bottom-right
    const poopCount = poopRef.current;
    if (poopCount > 0) {
      ctx.font = "10px serif";
      for (let i = 0; i < poopCount; i++) {
        ctx.fillText("💩", CANVAS_SIZE - 16 - i * 12, CANVAS_SIZE - 4);
      }
    }
  }, []);

  useEffect(() => {
    const bgImg = new Image();
    bgImg.src = "/tamagotchi/sprites/Backgrounds - Sanrio.png";
    bgImg.onload = () => {
      bgImgRef.current = bgImg;
      draw();
    };

    const charImg = new Image();
    charImg.src = "/tamagotchi/sprites/Kiraritchi.png";
    charImg.onload = () => {
      charImgRef.current = charImg;
      draw();
    };

    const interval = setInterval(() => {
      const frames = framesRef.current;
      if (frames.length > 0) {
        frameRef.current = (frameRef.current + 1) % frames.length;
        draw();
      }
    }, FRAME_INTERVAL);

    return () => clearInterval(interval);
  }, [draw]);

  const handleTap = (index: number) => {
    if (selected === index) {
      switch (index) {
        case 0: feed(); break;
        case 2: play(); break;
        case 3: heal(); break;
        case 4: cleanPoop(); break;
        case 5: setShowStats(true); break;
        default:
          console.log(`[Tamagotchi] ${MENU_ITEMS[index].icon} ${MENU_ITEMS[index].label} — 미구현`);
      }
      setSelected(null);
    } else {
      setSelected(index);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        로딩중...
      </div>
    );
  }

  const hungerCritical = state ? state.hunger === 0 : false;
  const happyCritical = state ? state.happy === 0 : false;

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black overflow-hidden">
      {/* HUD */}
      {state && (
        <div className="w-full max-w-md px-3 py-2 space-y-1 bg-black/60">
          {/* Age & stage */}
          <div className="text-center text-[10px] text-gray-400">
            {state.age}일 · {getStage(state.age)}
            {state.sick && <span className="ml-1 text-red-400">🤒 아픔</span>}
          </div>
          <div className="flex items-center justify-between">
            {/* Hunger: 4 bowls */}
            <div className="flex gap-0.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className="text-sm"
                  style={{
                    opacity:
                      i < state.hunger
                        ? 1
                        : hungerCritical && !blinkOn
                          ? 0
                          : 0.2,
                  }}
                >
                  🍚
                </span>
              ))}
            </div>
            {/* Happy: 8 hearts */}
            <div className="flex gap-0.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <span
                  key={i}
                  className="text-xs"
                  style={{
                    opacity:
                      i < state.happy
                        ? 1
                        : happyCritical && !blinkOn
                          ? 0
                          : 0.2,
                  }}
                >
                  {i < state.happy ? "❤️" : "🤍"}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="block flex-1 w-full max-w-md"
        style={{
          imageRendering: "pixelated",
          objectFit: "contain",
        }}
      />

      {/* Bottom menu */}
      <div className="flex w-full max-w-md justify-around py-2 bg-black/80 backdrop-blur-sm">
        {MENU_ITEMS.map((item, i) => {
          // Disable logic
          const disabled =
            (i === 3 && (!state || !state.sick)) ||    // 약: sick일 때만
            (i === 4 && (!state || state.poop <= 0));   // 화장실: poop≥1일 때만

          return (
            <button
              key={item.label}
              onClick={() => !disabled && handleTap(i)}
              className="flex flex-col items-center gap-0.5 px-1 py-1 rounded-lg transition-all"
              style={{
                background:
                  selected === i ? "rgba(255,255,255,0.15)" : "transparent",
                boxShadow:
                  selected === i ? "0 0 8px rgba(255,255,255,0.2)" : "none",
                opacity: disabled ? 0.3 : 1,
              }}
            >
              <span className="text-xl">{item.icon}</span>
              <span
                className="text-[10px]"
                style={{ color: selected === i ? "#fff" : "#888" }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stats popup */}
      {showStats && state && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setShowStats(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-5 min-w-[240px] text-sm space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-center font-bold text-white text-base">
              Kiraritchi 상태
            </h2>
            <div className="space-y-2 text-gray-300">
              <div className="flex justify-between">
                <span>🍚 배고픔</span>
                <span>
                  {Array.from({ length: 4 })
                    .map((_, i) => (i < state.hunger ? "●" : "○"))
                    .join("")}
                </span>
              </div>
              <div className="flex justify-between">
                <span>❤️ 행복도</span>
                <span>{state.happy}/8</span>
              </div>
              <div className="flex justify-between">
                <span>💩 응가</span>
                <span>{state.poop}/3</span>
              </div>
              <div className="flex justify-between">
                <span>🤒 상태</span>
                <span>{state.sick ? "아픔" : "건강"}</span>
              </div>
              <div className="flex justify-between">
                <span>📅 나이</span>
                <span>{state.age}일 ({getStage(state.age)})</span>
              </div>
              <div className="flex justify-between">
                <span>⚠️ 케어미스</span>
                <span>{state.care_mistakes}회</span>
              </div>
              <div className="flex justify-between">
                <span>🎮 오늘 놀이</span>
                <span>{state.play_count_today}/4</span>
              </div>
            </div>
            <button
              onClick={() => setShowStats(false)}
              className="w-full mt-2 py-1.5 rounded-lg bg-gray-800 text-white text-xs"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
