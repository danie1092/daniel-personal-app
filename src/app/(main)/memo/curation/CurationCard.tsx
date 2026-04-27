"use client";

import type { CurationItem } from "@/lib/curation/data";

type Props = {
  item: CurationItem;
  isDeadLetter?: boolean;
  onMore: (item: CurationItem) => void;
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const day = Math.floor(diffMs / 86400_000);
  if (day === 0) return "오늘";
  if (day === 1) return "어제";
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  return `${Math.floor(day / 30)}달 전`;
}

export function CurationCard({ item, isDeadLetter, onMore }: Props) {
  if (isDeadLetter) {
    return (
      <div className="bg-danger-soft/30 border border-hair rounded-card shadow-card p-3 mb-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[11px] px-2 py-0.5 bg-danger-soft text-danger rounded-chip font-bold">
            ⚠ 처리 실패
          </span>
          <span className="text-[11px] text-ink-muted">{relativeTime(item.createdAt)}</span>
        </div>
        <a href={item.url} target="_blank" rel="noopener noreferrer"
           className="text-[12px] text-ink-sub break-all underline">
          {item.url}
        </a>
        <button
          onClick={() => onMore(item)}
          className="mt-2 text-[12px] px-3 py-1 bg-ink text-white rounded-input font-semibold"
        >
          재처리
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-card border border-hair shadow-card p-3 mb-3 flex gap-3 active:opacity-80">
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
        {item.ogImage ? (
          <img
            src={item.ogImage}
            alt=""
            className="w-[88px] h-[88px] rounded-input bg-hair-light object-cover"
          />
        ) : (
          <div className="w-[88px] h-[88px] rounded-input bg-hair-light flex items-center justify-center text-2xl">
            🔗
          </div>
        )}
      </a>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0 block"
      >
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[11px] px-2 py-0.5 bg-primary-soft text-primary rounded-chip font-semibold">
            {item.category}
          </span>
          <span className="text-[11px] text-ink-muted">{relativeTime(item.processedAt)}</span>
        </div>
        {item.ogTitle && (
          <div className="text-[14px] font-bold text-ink line-clamp-1 mb-0.5">
            {item.ogTitle}
          </div>
        )}
        <div className="text-[12px] text-ink-sub line-clamp-2">{item.summary}</div>
      </a>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMore(item);
        }}
        aria-label="더보기"
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-ink-muted text-lg"
      >
        ⋯
      </button>
    </div>
  );
}
