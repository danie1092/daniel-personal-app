"use client";

import { useState } from "react";
import Link from "next/link";
import type { CurationItem, CurationFilter } from "@/lib/curation/data";
import { CURATION_CATEGORIES } from "@/lib/curation/categories";
import { CurationCard } from "./CurationCard";
import { CurationEditSheet } from "./CurationEditSheet";

type Props = {
  items: CurationItem[];
  counts: Record<CurationFilter, number>;
  activeFilter: CurationFilter;
};

export function CurationTab({ items, counts, activeFilter }: Props) {
  const [editing, setEditing] = useState<CurationItem | null>(null);

  const chipDefs: Array<{ key: CurationFilter; label: string }> = [
    { key: "all", label: "전체" },
    ...CURATION_CATEGORIES.map((c) => ({ key: c as CurationFilter, label: c })),
  ];
  if (counts["dead-letter"] > 0) {
    chipDefs.push({ key: "dead-letter", label: "⚠ 처리 실패" });
  }

  return (
    <div>
      {/* 카테고리 chip 필터 */}
      <div className="px-4 pt-3 pb-2 overflow-x-auto whitespace-nowrap bg-surface border-b border-hair-light">
        {chipDefs.map((chip) => {
          const active = chip.key === activeFilter;
          const n = counts[chip.key] ?? 0;
          const href =
            chip.key === "all"
              ? "/memo?tab=curation"
              : `/memo?tab=curation&cat=${encodeURIComponent(chip.key)}`;
          return (
            <Link
              key={chip.key}
              href={href}
              replace
              className={
                active
                  ? "inline-block mr-1.5 px-3 py-1.5 rounded-input bg-ink text-white text-[12px] font-bold"
                  : "inline-block mr-1.5 px-3 py-1.5 rounded-input bg-hair-light text-ink-sub text-[12px] font-semibold"
              }
            >
              {chip.label} {n > 0 && <span className="opacity-70">{n}</span>}
            </Link>
          );
        })}
      </div>

      {/* 카드 리스트 */}
      <div className="p-4">
        {items.length === 0 ? (
          <div className="px-4 py-12 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-primary-soft flex items-center justify-center text-3xl mb-4">
              📥
            </div>
            <p className="text-[13px] text-ink-sub leading-relaxed max-w-xs">
              아직 큐레이션된 항목이 없어요. 인스타에서 단축어로 링크를 보내면 여기 자동으로 정리돼요.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <CurationCard
              key={item.id}
              item={item}
              isDeadLetter={activeFilter === "dead-letter"}
              onMore={setEditing}
            />
          ))
        )}
      </div>

      <CurationEditSheet item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
