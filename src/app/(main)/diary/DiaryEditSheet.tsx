"use client";

import { useState, useTransition } from "react";
import { DIARY_EMOTIONS } from "@/lib/constants";
import type { DiaryEntry } from "@/lib/diary/data";
import { EMOTION_TOKENS, type DiaryEmotion } from "./emotionTokens";
import { updateDiary, deleteDiary } from "./actions";

type Props = {
  entry: DiaryEntry;
  onClose: () => void;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function formatLong(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}

export function DiaryEditSheet({ entry, onClose }: Props) {
  const [content, setContent] = useState(entry.content);
  const [emotion, setEmotion] = useState(entry.emotion ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  function handleSave() {
    if (!content.trim()) {
      setError("내용을 입력하세요");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await updateDiary(entry.id, { date: entry.date, content, emotion });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    });
  }

  function handleDelete() {
    if (!confirm("이 일기를 삭제할까요?")) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteDiary(entry.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mt-auto bg-surface rounded-t-sheet max-h-[85vh] flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hair-light">
          <div>
            <h2 className="text-[14px] font-bold">{formatLong(entry.date)}</h2>
            {entry.emotion && (
              <p className="text-[11px] text-ink-sub mt-0.5">
                {EMOTION_TOKENS[entry.emotion as DiaryEmotion]?.emoji} {EMOTION_TOKENS[entry.emotion as DiaryEmotion]?.label}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-[13px] text-ink-sub">닫기</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {editing ? (
            <>
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
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                maxLength={8192}
                className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[13px] outline-none resize-none leading-relaxed"
              />
            </>
          ) : (
            <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{content}</p>
          )}

          {error && <p className="text-[12px] text-danger mt-3">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-hair-light flex gap-2">
          {editing ? (
            <>
              <button
                onClick={handleDelete}
                disabled={pending}
                className="flex-1 py-2.5 bg-danger-soft text-danger rounded-input text-[13px] font-bold disabled:opacity-50"
              >
                삭제
              </button>
              <button
                onClick={handleSave}
                disabled={pending}
                className="flex-[2] py-2.5 bg-primary text-white rounded-input text-[13px] font-bold disabled:opacity-50"
              >
                {pending ? "저장 중..." : "저장"}
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="w-full py-2.5 bg-ink text-white rounded-input text-[13px] font-bold"
            >
              수정
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
