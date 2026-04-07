"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useTamagotchi } from "@/hooks/useTamagotchi";

const CANVAS_SIZE = 128;
const SPRITE_SIZE = 46; // each layer PNG is 46x46

// Background tile
const BG_TILE_X = 391;
const BG_TILE_Y = 1;
const BG_TILE_SIZE = 128;

const IMG_BASE = "/tamagotchi/sprites/Kiraritchi_images";

// ── Frame definitions: [body, eyes, hair] file numbers ──
// Each animation frame = body + eyes + hair overlaid at same position
type FrameDef = { body: number; eyes: number; hair: number };

const ANIM_IDLE: FrameDef[] = [
  { body: 1, eyes: 1, hair: 1 },
  { body: 1, eyes: 2, hair: 1 },
  { body: 2, eyes: 1, hair: 1 },
  { body: 2, eyes: 2, hair: 1 },
];

const ANIM_HAPPY: FrameDef[] = [
  { body: 1, eyes: 3, hair: 1 },
  { body: 2, eyes: 6, hair: 1 },
];

const ANIM_HUNGRY: FrameDef[] = [
  { body: 1, eyes: 9, hair: 1 },
  { body: 2, eyes: 12, hair: 1 },
];

const ANIM_SICK: FrameDef[] = [
  { body: 1, eyes: 15, hair: 1 },
  { body: 2, eyes: 13, hair: 1 },
];

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

const MOOD_ANIMS: Record<Mood, FrameDef[]> = {
  idle: ANIM_IDLE,
  happy: ANIM_HAPPY,
  hungry: ANIM_HUNGRY,
  sick: ANIM_SICK,
};

const MOOD_INTERVALS: Record<Mood, number> = {
  idle: INTERVAL_IDLE,
  happy: INTERVAL_HAPPY,
  hungry: INTERVAL_HUNGRY,
  sick: INTERVAL_SICK,
};

// ── AI states ──
type AIState = "wait" | "decide" | "walkLeft" | "walkRight" | "idle";

const WALK_SPEED = 1;
const CHAR_MIN_X = SPRITE_SIZE / 2 + 8;
const CHAR_MAX_X = CANVAS_SIZE - SPRITE_SIZE / 2 - 8;

const MENU_ITEMS = [
  { icon: "🍚", label: "밥" },
  { icon: "💡", label: "불" },
  { icon: "🎮", label: "놀이" },
  { icon: "💊", label: "약" },
  { icon: "🚿", label: "화장실" },
  { icon: "📊", label: "상태" },
];

function getStage(age: number): string {
  if (age < 1) return "베이비";
  if (age < 3) return "유아기";
  if (age < 7) return "성장기";
  return "성인기";
}

// Preload all layer images
function preloadImages(): Promise<Record<string, HTMLImageElement>> {
  const files: string[] = [];
  for (let i = 1; i <= 9; i++) files.push(`body${i}`);
  for (let i = 1; i <= 15; i++) files.push(`eyes${i}`);
  for (let i = 1; i <= 7; i++) files.push(`hair${i}`);
  for (let i = 1; i <= 3; i++) files.push(`etc${i}`);

  return Promise.all(
    files.map(
      (name) =>
        new Promise<[string, HTMLImageElement]>((resolve) => {
          const img = new Image();
          img.src = `${IMG_BASE}/${name}.png`;
          img.onload = () => resolve([name, img]);
          img.onerror = () => resolve([name, img]); // graceful
        })
    )
  ).then((entries) => Object.fromEntries(entries));
}

export default function TamagotchiPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const imgsRef = useRef<Record<string, HTMLImageElement>>({});

  // Animation refs
  const frameRef = useRef(0);
  const moodRef = useRef<Mood>("idle");
  const animRef = useRef<FrameDef[]>(ANIM_IDLE);
  const intervalRef = useRef(INTERVAL_IDLE);
  const poopRef = useRef(0);
  const animTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // AI state machine refs
  const aiStateRef = useRef<AIState>("wait");
  const aiTimerRef = useRef(0);
  const charXRef = useRef(Math.floor(CANVAS_SIZE / 2));
  const charYOffsetRef = useRef(0);
  const facingLeftRef = useRef(false);
  const isWalkingRef = useRef(false);

  const [selected, setSelected] = useState<number | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [blinkOn, setBlinkOn] = useState(true);
  const [showReset, setShowReset] = useState(false);

  const { state, loading, feed, play, cleanPoop, heal, resetStats } =
    useTamagotchi();

  // Blink timer
  useEffect(() => {
    const interval = setInterval(() => setBlinkOn((v) => !v), 500);
    return () => clearInterval(interval);
  }, []);

  // Update anim set when mood changes
  useEffect(() => {
    if (!state) return;
    const mood = getMood(state.hunger, state.happy, state.sick);
    if (mood !== moodRef.current) {
      moodRef.current = mood;
      animRef.current = MOOD_ANIMS[mood];
      intervalRef.current = MOOD_INTERVALS[mood];
      frameRef.current = 0;
    }
    poopRef.current = state.poop;
  }, [state]);

  // ── Draw function ──
  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    // Background
    if (bgImgRef.current) {
      ctx.drawImage(
        bgImgRef.current,
        BG_TILE_X, BG_TILE_Y, BG_TILE_SIZE, BG_TILE_SIZE,
        0, 0, CANVAS_SIZE, CANVAS_SIZE
      );
    }

    // Character: overlay body → hair → eyes at same destXY
    const anim = animRef.current;
    const fi = frameRef.current;
    const imgs = imgsRef.current;

    if (anim.length > 0 && Object.keys(imgs).length > 0) {
      const frame = anim[fi % anim.length];
      const destX = charXRef.current - SPRITE_SIZE / 2;
      const destY = CANVAS_SIZE - SPRITE_SIZE - 4 + charYOffsetRef.current;

      const bodyImg = imgs[`body${frame.body}`];
      const eyesImg = imgs[`eyes${frame.eyes}`];
      const hairImg = imgs[`hair${frame.hair}`];

      const EYE_OFFSET = 0;
      if (facingLeftRef.current) {
        // Flip body + hair
        ctx.save();
        ctx.translate(destX + SPRITE_SIZE, destY);
        ctx.scale(-1, 1);
        if (bodyImg) ctx.drawImage(bodyImg, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 0, 0, SPRITE_SIZE, SPRITE_SIZE);
        if (hairImg) ctx.drawImage(hairImg, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 0, 0, SPRITE_SIZE, SPRITE_SIZE);
        ctx.restore();
        // Eyes: also flip horizontally
        if (eyesImg) {
          ctx.save();
          ctx.translate(destX + SPRITE_SIZE, destY);
          ctx.scale(-1, 1);
          ctx.drawImage(eyesImg, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 0, 0, SPRITE_SIZE, SPRITE_SIZE);
          ctx.restore();
        }
      } else {
        if (bodyImg) ctx.drawImage(bodyImg, 0, 0, SPRITE_SIZE, SPRITE_SIZE, destX, destY, SPRITE_SIZE, SPRITE_SIZE);
        if (hairImg) ctx.drawImage(hairImg, 0, 0, SPRITE_SIZE, SPRITE_SIZE, destX, destY, SPRITE_SIZE, SPRITE_SIZE);
        if (eyesImg) ctx.drawImage(eyesImg, 0, 0, SPRITE_SIZE, SPRITE_SIZE, destX - EYE_OFFSET, destY, SPRITE_SIZE, SPRITE_SIZE);
      }
    }

    // Poop icons
    const poopCount = poopRef.current;
    if (poopCount > 0) {
      ctx.font = "10px serif";
      for (let i = 0; i < poopCount; i++) {
        ctx.fillText("💩", CANVAS_SIZE - 16 - i * 12, CANVAS_SIZE - 4);
      }
    }
  }, []);

  // ── AI state machine tick ──
  const aiTick = useCallback(() => {
    const st = aiStateRef.current;

    if (st === "wait") {
      aiTimerRef.current -= 150;
      if (aiTimerRef.current <= 0) aiStateRef.current = "decide";
    } else if (st === "decide") {
      const r = Math.random();
      if (r < 0.6) {
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
      charXRef.current += st === "walkLeft" ? -WALK_SPEED : WALK_SPEED;
      charYOffsetRef.current = charYOffsetRef.current === 0 ? -1 : 0;

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
    // Load background
    const bgImg = new Image();
    bgImg.src = "/tamagotchi/sprites/Backgrounds - Sanrio.png";
    bgImg.onload = () => { bgImgRef.current = bgImg; draw(); };

    // Preload all layer PNGs
    preloadImages().then((loaded) => {
      imgsRef.current = loaded;
      draw();
    });

    // Initialize AI
    aiStateRef.current = "wait";
    aiTimerRef.current = 2000 + Math.random() * 2000;
    charXRef.current = Math.floor(CANVAS_SIZE / 2);

    // AI tick at 150ms
    const aiInterval = setInterval(() => { aiTick(); draw(); }, 150);

    // Mood animation at variable interval
    let lastInterval = intervalRef.current;
    function scheduleMoodFrame() {
      animTimerRef.current = setTimeout(() => {
        const anim = animRef.current;
        if (anim.length > 0 && !isWalkingRef.current) {
          frameRef.current = (frameRef.current + 1) % anim.length;
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
        default: break;
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
      {state && (
        <div className="w-full max-w-md px-3 py-2 space-y-1 bg-black/60">
          <div className="text-center text-[10px] text-gray-400">
            {state.age}일 · {getStage(state.age)}
            {state.sick && <span className="ml-1 text-red-400">🤒 아픔</span>}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-0.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className="text-sm"
                  style={{
                    opacity: i < state.hunger ? 1 : hungerCritical && !blinkOn ? 0 : 0.2,
                  }}
                >
                  🍚
                </span>
              ))}
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <span
                  key={i}
                  className="text-xs"
                  style={{
                    opacity: i < state.happy ? 1 : happyCritical && !blinkOn ? 0 : 0.2,
                  }}
                >
                  {i < state.happy ? "❤️" : "🤍"}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="block flex-1 w-full max-w-md"
        style={{ imageRendering: "pixelated", objectFit: "contain" }}
      />

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
                background: selected === i ? "rgba(255,255,255,0.15)" : "transparent",
                boxShadow: selected === i ? "0 0 8px rgba(255,255,255,0.2)" : "none",
                opacity: disabled ? 0.3 : 1,
              }}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px]" style={{ color: selected === i ? "#fff" : "#888" }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {showStats && state && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setShowStats(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-5 min-w-[240px] text-sm space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-center font-bold text-white text-base">Kiraritchi 상태</h2>
            <div className="space-y-2 text-gray-300">
              <div className="flex justify-between"><span>🍚 배고픔</span><span>{Array.from({ length: 4 }).map((_, i) => (i < state.hunger ? "●" : "○")).join("")}</span></div>
              <div className="flex justify-between"><span>❤️ 행복도</span><span>{state.happy}/8</span></div>
              <div className="flex justify-between"><span>💩 응가</span><span>{state.poop}/3</span></div>
              <div className="flex justify-between"><span>🤒 상태</span><span>{state.sick ? "아픔" : "건강"}</span></div>
              <div className="flex justify-between"><span>📅 나이</span><span>{state.age}일 ({getStage(state.age)})</span></div>
              <div className="flex justify-between"><span>⚠️ 케어미스</span><span>{state.care_mistakes}회</span></div>
              <div className="flex justify-between"><span>🎮 오늘 놀이</span><span>{state.play_count_today}/4</span></div>
            </div>
            <div className="pt-2 border-t border-gray-700 space-y-2">
              {!showReset ? (
                <button onClick={() => setShowReset(true)} className="w-full py-1.5 rounded-lg bg-gray-800 text-gray-500 text-[10px]">개발자 옵션</button>
              ) : (
                <button onClick={() => { resetStats(); setShowReset(false); setShowStats(false); }} className="w-full py-1.5 rounded-lg bg-red-900/60 text-red-300 text-xs">🔄 수치 리셋 (hunger=4, happy=8)</button>
              )}
            </div>
            <button onClick={() => setShowStats(false)} className="w-full mt-2 py-1.5 rounded-lg bg-gray-800 text-white text-xs">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
