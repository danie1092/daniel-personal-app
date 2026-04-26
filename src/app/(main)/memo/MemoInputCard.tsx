"use client";

import { useState, useTransition } from "react";
import { MEMO_TAGS } from "@/lib/constants";
import { createMemo } from "./actions";

export function MemoInputCard() {
  const [content, setContent] = useState("");
  const [tag, setTag] = useState<string>(MEMO_TAGS[0]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const text = content.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const r = await createMemo({ content: text, tag });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setContent("");
    });
  }

  return (
    <div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
      <div className="flex gap-2 mb-2.5">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSave();
            }
          }}
          placeholder="지금 떠오른 것을 기록해요"
          rows={2}
          maxLength={8192}
          className="flex-1 bg-hair-light rounded-input px-3 py-2 text-[13px] outline-none placeholder:text-ink-muted resize-none"
          disabled={pending}
        />
        <button
          onClick={handleSave}
          disabled={!content.trim() || pending}
          className="self-end bg-ink text-white rounded-input px-3 py-2 text-[12px] font-bold disabled:opacity-25 active:opacity-70"
        >
          {pending ? "..." : "저장"}
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {MEMO_TAGS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTag(t)}
            className={
              tag === t
                ? "flex-shrink-0 px-2.5 py-1 rounded-chip bg-ink text-white text-[11px] font-bold"
                : "flex-shrink-0 px-2.5 py-1 rounded-chip bg-hair-light text-ink-sub text-[11px]"
            }
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="text-[11px] text-danger mt-2">{error}</p>}
    </div>
  );
}
