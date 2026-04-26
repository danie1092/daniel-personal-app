import { DIARY_EMOTIONS } from "@/lib/constants";

export type DiaryEmotion = (typeof DIARY_EMOTIONS)[number];

export type EmotionToken = {
  emoji: string;
  label: string;
  /** Tailwind bg class for cards/dots */
  bg: string;
  /** Hex for grass dots */
  dotHex: string;
};

export const EMOTION_TOKENS: Record<DiaryEmotion, EmotionToken> = {
  "😊 행복": { emoji: "😊", label: "행복", bg: "bg-amber-50",  dotHex: "#FBBF24" },
  "😌 평온": { emoji: "😌", label: "평온", bg: "bg-sky-50",    dotHex: "#0EA5E9" },
  "😔 슬픔": { emoji: "😔", label: "슬픔", bg: "bg-indigo-50", dotHex: "#6366F1" },
  "😤 화남": { emoji: "😤", label: "화남", bg: "bg-rose-50",   dotHex: "#F43F5E" },
  "😰 불안": { emoji: "😰", label: "불안", bg: "bg-orange-50", dotHex: "#F97316" },
  "😴 피곤": { emoji: "😴", label: "피곤", bg: "bg-slate-50",  dotHex: "#64748B" },
  "🥰 설렘": { emoji: "🥰", label: "설렘", bg: "bg-pink-50",   dotHex: "#EC4899" },
  "😐 보통": { emoji: "😐", label: "보통", bg: "bg-stone-50",  dotHex: "#A8A29E" },
};
