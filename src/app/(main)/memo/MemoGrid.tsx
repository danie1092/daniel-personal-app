"use client";

import { useState, useMemo } from "react";
import type { MemoEntry } from "@/lib/memo/list";
import { TAG_COLORS } from "@/lib/memoColors";
import { MemoEditSheet } from "./MemoEditSheet";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 8) return `${d}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

type Props = {
  memos: MemoEntry[];
  search: string;
  filterTag: string | null;
};

export function MemoGrid({ memos, search, filterTag }: Props) {
  const [editing, setEditing] = useState<MemoEntry | null>(null);

  const filtered = useMemo(() => {
    return memos.filter((m) => {
      if (filterTag && m.tag !== filterTag) return false;
      if (search && !m.content.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [memos, search, filterTag]);

  if (filtered.length === 0) {
    return (
      <p className="text-center text-[12px] text-ink-muted py-12">
        {search || filterTag ? "검색 결과가 없어요" : "아직 메모가 없어요"}
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 px-3 py-3">
        {filtered.map((memo) => (
          <button
            key={memo.id}
            onClick={() => setEditing(memo)}
            className={`${TAG_COLORS[memo.tag] ?? "bg-hair-light"} rounded-card p-3 flex flex-col gap-1.5 min-h-[88px] text-left active:opacity-80`}
          >
            <span className="text-[10px] text-ink-muted font-semibold">{memo.tag}</span>
            <p className="text-[12px] text-ink leading-relaxed line-clamp-5 flex-1">
              {memo.content}
            </p>
            <span className="text-[10px] text-ink-muted mt-auto">{timeAgo(memo.created_at)}</span>
          </button>
        ))}
      </div>
      {editing && <MemoEditSheet memo={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
