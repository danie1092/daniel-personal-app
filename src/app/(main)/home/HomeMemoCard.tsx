"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createQuickMemo } from "./actions";
import type { RecentMemo } from "@/lib/memo/recent";
import { TAG_COLORS } from "@/lib/memoColors";

type Props = { memos: RecentMemo[] };

export function HomeMemoCard({ memos }: Props) {
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const text = content.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const result = await createQuickMemo(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setContent("");
    });
  }

  return (
    <div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-[14px] font-bold">메모</h2>
        <Link href="/memo" className="text-[11px] text-ink-sub">
          더보기 →
        </Link>
      </div>

      {/* 빠른메모 input */}
      <div className="flex gap-2 mb-3">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSave();
            }
          }}
          placeholder="지금 떠오른 것을…"
          maxLength={512}
          className="flex-1 bg-hair-light rounded-input px-3 py-2.5 text-[13px] outline-none placeholder:text-ink-muted disabled:opacity-50"
          disabled={pending}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!content.trim() || pending}
          className="bg-ink text-white rounded-input px-4 py-2.5 text-[12px] font-bold disabled:opacity-25 active:opacity-70"
        >
          {pending ? "..." : "저장"}
        </button>
      </div>

      {error && <p className="text-[11px] text-danger mb-2">{error}</p>}

      {/* 최근 메모 가로 스크롤 */}
      {memos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {memos.map((memo) => (
            <div
              key={memo.id}
              className={`${TAG_COLORS[memo.tag] ?? "bg-hair-light"} flex-shrink-0 w-[160px] rounded-input p-2.5`}
            >
              <div className="text-[9px] font-bold opacity-60">{memo.tag}</div>
              <p className="text-[12px] mt-1 line-clamp-3 leading-relaxed">{memo.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
