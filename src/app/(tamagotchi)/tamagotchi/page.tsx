"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useTamagotchi } from "@/hooks/useTamagotchi";

const CANVAS_SIZE = 128;
// Kiraritchi sprite: 800×174, frame width=40, scale=1
const FRAME_W = 40;
// 3 layers with source-relative Y offsets (anchor = body at sy=30)
const BODY_SY = 30;
const BODY_SH = 56;
const EYE_SY = 0;
const EYE_SH = 30;
const ACC_SY = 95;
const ACC_SH = 25;

// Background tile: 4th tile in Backgrounds - Sanrio.png
const BG_TILE_X = 391;
const BG_TILE_Y = 1;
const BG_TILE_SIZE = 128;

// ── Frame sets & intervals per mood ──
const FRAMES_IDLE = [13, 14, 15, 16];
const FRAMES_HAPPY = [3, 6];
const FRAMES_HUNGRY = [9, 12];
const FRAMES_SICK = [17, 13];
const INTERVAL_IDLE = 600;
const INTERVAL_HAPPY = 400;
const INTERVAL_HUNGRY = 800;
const INTERVAL_SICK = 600;
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

const MOOD_INTERVALS: Record<Mood, number> = {
  idle: INTERVAL_IDLE,
  happy: INTERVAL_HAPPY,
  hungry: INTERVAL_HUNGRY,
  sick: INTERVAL_SICK,
};

// ── AI states ──
type AIState = "wait" | "decide" | "walkLeft" | "walkRight" | "idle";

const WALK_SPEED = 1; // px per tick
// charXRef stores CENTER x position
const CHAR_MIN_X = FRAME_W / 2 + 8;
const CHAR_MAX_X = CANVAS_SIZE - FRAME_W / 2 - 8;

const MENU_ITEMS = [
  { icon: "🍚", label: "밥" },
  { icon: "💡", label: "불" },
  { icon: "🎮", label: "놀이" },
  { icon: "💊", label: "약" },
  { icon: "🚿", label: "화장실" },
  { icon: "📊", label: "상태" },
];

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

  // Animation refs
  const frameRef = useRef(0);
  const moodRef = useRef<Mood>("idle");
  const framesRef = useRef(FRAMES_IDLE);
  const intervalRef = useRef(INTERVAL_IDLE);
  const poopRef = useRef(0);
  const animTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // AI state machine refs
  const aiStateRef = useRef<AIState>("wait");
  const aiTimerRef = useRef(0);
  const charXRef = useRef(Math.floor(CANVAS_SIZE / 2));
  const charYOffsetRef = useRef(0); // bounce offset
  const facingLeftRef = useRef(false);
  const isWalkingRef = useRef(false);

  const [selected, setSelected] = useState<number | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [blinkOn, setBlinkOn] = useState(true);
  const [showReset, setShowReset] = useState(false);

  const { state, loading, feed, play, cleanPoop, heal, resetStats } =
    useTamagotchi();

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
      intervalRef.current = MOOD_INTERVALS[mood];
      frameRef.current = 0;
    }
    poopRef.current = state.poop;
  }, [state]);

  // ── Draw function ──
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

    // 3-layer sprite: body(anchor) → accessory → eyes
    const frames = framesRef.current;
    const fi = frameRef.current;

    if (charImgRef.current && frames.length > 0) {
      const img = charImgRef.current;
      const frameIdx = frames[fi % frames.length];
      const sx = frameIdx * FRAME_W;
      const destX = charXRef.current - FRAME_W / 2;
      const bodyBottom = CANVAS_SIZE - 4 + charYOffsetRef.current;
      const bodyDY = bodyBottom - BODY_SH;
      const eyeDY = bodyBottom - BODY_SH - EYE_SH;
      const accDY = bodyBottom - BODY_SH - ACC_SH;

      ctx.save();
      if (facingLeftRef.current) {
        ctx.translate(destX + FRAME_W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, sx, BODY_SY, FRAME_W, BODY_SH, 0, bodyDY, FRAME_W, BODY_SH);
        ctx.drawImage(img, sx, ACC_SY,  FRAME_W, ACC_SH,  0, accDY,  FRAME_W, ACC_SH);
        ctx.drawImage(img, sx, EYE_SY,  FRAME_W, EYE_SH,  0, eyeDY,  FRAME_W, EYE_SH);
      } else {
        ctx.drawImage(img, sx, BODY_SY, FRAME_W, BODY_SH, destX, bodyDY, FRAME_W, BODY_SH);
        ctx.drawImage(img, sx, ACC_SY,  FRAME_W, ACC_SH,  destX, accDY,  FRAME_W, ACC_SH);
        ctx.drawImage(img, sx, EYE_SY,  FRAME_W, EYE_SH,  destX, eyeDY,  FRAME_W, EYE_SH);
      }
      ctx.restore();
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

  // ── AI state machine tick (runs every ~150ms) ──
  const aiTick = useCallback(() => {
    const st = aiStateRef.current;

    if (st === "wait") {
      aiTimerRef.current -= 150;
      if (aiTimerRef.current <= 0) {
        aiStateRef.current = "decide";
      }
    } else if (st === "decide") {
      const r = Math.random();
      if (r < 0.6) {
        // idle: stay in place 2~4s
        aiStateRef.current = "wait";
        aiTimerRef.current = 2000 + Math.random() * 2000;
        isWalkingRef.current = false;
      } else if (r < 0.8) {
        aiStateRef.current = "walkLeft";
        aiTimerRef.current = 1500 + Math.random() * 2000;
        isWalkingRef.current = true;
        facingLeftRef.current = true;
      } else {
        aiStateRef.current = "walkRight";
        aiTimerRef.current = 1500 + Math.random() * 2000;
        isWalkingRef.current = true;
        facingLeftRef.current = false;
      }
    } else if (st === "walkLeft" || st === "walkRight") {
      aiTimerRef.current -= 150;
      const dir = st === "walkLeft" ? -WALK_SPEED : WALK_SPEED;
      charXRef.current += dir;

      // Bounce: 1px up/down
      charYOffsetRef.current = charYOffsetRef.current === 0 ? -1 : 0;

      // Boundary check
      if (charXRef.current <= CHAR_MIN_X) {
        charXRef.current = CHAR_MIN_X;
        aiStateRef.current = "walkRight";
        facingLeftRef.current = false;
        aiTimerRef.current = 1000 + Math.random() * 1500;
      } else if (charXRef.current >= CHAR_MAX_X) {
        charXRef.current = CHAR_MAX_X;
        aiStateRef.current = "walkLeft";
        facingLeftRef.current = true;
        aiTimerRef.current = 1000 + Math.random() * 1500;
      }

      if (aiTimerRef.current <= 0) {
        aiStateRef.current = "wait";
        aiTimerRef.current = 2000 + Math.random() * 2000;
        isWalkingRef.current = false;
        charYOffsetRef.current = 0;
      }
    }
  }, []);

  // ── Main animation loop ──
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

    // Initialize AI
    aiStateRef.current = "wait";
    aiTimerRef.current = 2000 + Math.random() * 2000;
    charXRef.current = Math.floor(CANVAS_SIZE / 2);

    // AI tick at 150ms
    const aiInterval = setInterval(() => {
      aiTick();
      draw();
    }, 150);

    // Mood animation at variable interval
    let lastInterval = intervalRef.current;
    function scheduleMoodFrame() {
      animTimerRef.current = setTimeout(() => {
        const frames = framesRef.current;
        if (frames.length > 0 && !isWalkingRef.current) {
          frameRef.current = (frameRef.current + 1) % frames.length;
        }
        draw();
        lastInterval = intervalRef.current;
        scheduleMoodFrame();
      }, lastInterval);
    }
    scheduleMoodFrame();

    return () => {
      clearInterval(aiInterval);
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
  }, [draw, aiTick]);

  const handleTap = (index: number) => {
    if (selected === index) {
      switch (index) {
        case 0: feed(); break;
        case 2: play(); break;
        case 3: heal(); break;
        case 4: cleanPoop(); break;
        case 5: setShowStats(true); break;
        default:
          console.log(
            `[Tamagotchi] ${MENU_ITEMS[index].icon} ${MENU_ITEMS[index].label} — 미구현`
          );
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
          const disabled =
            (i === 3 && (!state || !state.sick)) ||
            (i === 4 && (!state || state.poop <= 0));

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
                <span>
                  {state.age}일 ({getStage(state.age)})
                </span>
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
            {/* Dev reset button */}
            <div className="pt-2 border-t border-gray-700 space-y-2">
              {!showReset ? (
                <button
                  onClick={() => setShowReset(true)}
                  className="w-full py-1.5 rounded-lg bg-gray-800 text-gray-500 text-[10px]"
                >
                  개발자 옵션
                </button>
              ) : (
                <button
                  onClick={() => {
                    resetStats();
                    setShowReset(false);
                    setShowStats(false);
                  }}
                  className="w-full py-1.5 rounded-lg bg-red-900/60 text-red-300 text-xs"
                >
                  🔄 수치 리셋 (hunger=4, happy=8)
                </button>
              )}
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
