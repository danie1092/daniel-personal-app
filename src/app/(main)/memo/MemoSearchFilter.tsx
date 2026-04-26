"use client";

import { MEMO_TAGS } from "@/lib/constants";

type Props = {
  search: string;
  onSearchChange: (s: string) => void;
  filterTag: string | null;
  onFilterChange: (tag: string | null) => void;
};

export function MemoSearchFilter({ search, onSearchChange, filterTag, onFilterChange }: Props) {
  return (
    <div className="bg-surface px-4 py-2.5 border-b border-hair-light flex flex-col gap-2">
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="검색"
        className="w-full bg-hair-light rounded-input px-3 py-1.5 text-[12px] outline-none placeholder:text-ink-muted"
      />
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => onFilterChange(null)}
          className={
            filterTag === null
              ? "flex-shrink-0 px-2.5 py-1 rounded-chip bg-ink text-white text-[11px] font-bold"
              : "flex-shrink-0 px-2.5 py-1 rounded-chip bg-hair-light text-ink-sub text-[11px]"
          }
        >
          전체
        </button>
        {MEMO_TAGS.map((t) => (
          <button
            key={t}
            onClick={() => onFilterChange(filterTag === t ? null : t)}
            className={
              filterTag === t
                ? "flex-shrink-0 px-2.5 py-1 rounded-chip bg-ink text-white text-[11px] font-bold"
                : "flex-shrink-0 px-2.5 py-1 rounded-chip bg-hair-light text-ink-sub text-[11px]"
            }
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
