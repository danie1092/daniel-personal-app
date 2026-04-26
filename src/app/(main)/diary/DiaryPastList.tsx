"use client";

import { useState } from "react";
import type { DiaryEntry } from "@/lib/diary/data";
import { EMOTION_TOKENS, type DiaryEmotion } from "./emotionTokens";
import { DiaryEditSheet } from "./DiaryEditSheet";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function formatShort(dateStr: string): { md: string; dow: string } {
  const d = new Date(dateStr + "T00:00:00");
  return {
    md: `${d.getMonth() + 1}/${d.getDate()}`,
    dow: WEEKDAYS[d.getDay()],
  };
}

export function DiaryPastList({ entries }: { entries: DiaryEntry[] }) {
  const [open, setOpen] = useState<DiaryEntry | null>(null);

  if (entries.length === 0) {
    return <p className="text-center text-[12px] text-ink-muted py-6">아직 기록이 없어요</p>;
  }

  return (
    <>
      <div className="flex flex-col gap-2 px-4 pb-6">
        {entries.map((e) => {
          const { md, dow } = formatShort(e.date);
          const tok = e.emotion ? EMOTION_TOKENS[e.emotion as DiaryEmotion] : null;
          return (
            <button
              key={e.id}
              onClick={() => setOpen(e)}
              className={`${tok?.bg ?? "bg-hair-light"} rounded-card px-4 py-3 flex gap-3 items-start text-left active:opacity-80`}
            >
              <div className="flex-shrink-0 text-center w-8">
                <p className="text-[10px] text-ink-muted">{md}</p>
                <p className="text-[10px] text-ink-muted">{dow}</p>
              </div>
              <div className="flex-1 min-w-0">
                {tok && (
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-[13px]">{tok.emoji}</span>
                    <span className="text-[10px] text-ink-sub font-semibold">{tok.label}</span>
                  </div>
                )}
                <p className="text-[12px] text-ink leading-relaxed line-clamp-2">{e.content}</p>
              </div>
            </button>
          );
        })}
      </div>
      {open && <DiaryEditSheet entry={open} onClose={() => setOpen(null)} />}
    </>
  );
}
