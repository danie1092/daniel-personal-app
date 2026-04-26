"use client";

import { useState, useTransition, useRef } from "react";
import { DIARY_EMOTIONS } from "@/lib/constants";
import { EMOTION_TOKENS, type DiaryEmotion } from "./emotionTokens";
import { playTypingSound } from "@/lib/acSound";
import { upsertTodayDiary } from "./actions";

type Props = {
  todayStr: string;
  initialContent?: string;
  initialEmotion?: string;
  isEdit: boolean;
};

export function DiaryInputCard({ todayStr, initialContent = "", initialEmotion = "", isEdit }: Props) {
  const [content, setContent] = useState(initialContent);
  const [emotion, setEmotion] = useState(initialEmotion);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const prevLenRef = useRef(initialContent.length);

  function handleContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    if (next.length > prevLenRef.current) {
      playTypingSound(next[next.length - 1] ?? "a");
    }
    prevLenRef.current = next.length;
    setContent(next);
  }

  function handleSave() {
    if (!content.trim()) return;
    setError(null);
    startTransition(async () => {
      const r = await upsertTodayDiary(todayStr, { content, emotion });
      if (!r.ok) {
        setError(r.error);
        return;
      }
    });
  }

  return (
    <div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
      <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-2">
        오늘 기분
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {DIARY_EMOTIONS.map((em) => {
          const tok = EMOTION_TOKENS[em as DiaryEmotion];
          const selected = emotion === em;
          return (
            <button
              key={em}
              type="button"
              onClick={() => setEmotion(selected ? "" : em)}
              className={
                selected
                  ? "flex items-center gap-1 px-2.5 py-1.5 rounded-input bg-ink text-white text-[11px] font-bold"
                  : `flex items-center gap-1 px-2.5 py-1.5 rounded-input ${tok.bg} text-ink-sub text-[11px]`
              }
            >
              <span className="text-[13px] leading-none">{tok.emoji}</span>
              <span>{tok.label}</span>
            </button>
          );
        })}
      </div>

      <textarea
        value={content}
        onChange={handleContentChange}
        placeholder="오늘 하루를 기록해요"
        rows={5}
        maxLength={8192}
        className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[13px] outline-none placeholder:text-ink-muted resize-none mb-2 leading-relaxed"
      />

      {error && <p className="text-[11px] text-danger mb-2">{error}</p>}

      <button
        onClick={handleSave}
        disabled={!content.trim() || pending}
        className="w-full py-2.5 bg-primary text-white rounded-input text-[13px] font-bold disabled:opacity-25 active:opacity-70"
      >
        {pending ? "저장 중..." : isEdit ? "수정" : "저장"}
      </button>
    </div>
  );
}
