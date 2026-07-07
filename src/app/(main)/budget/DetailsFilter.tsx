"use client";

import { BUDGET_CATEGORIES } from "@/lib/constants";

const BASE_CATEGORIES = BUDGET_CATEGORIES.filter((c) => c !== "월급" && c !== "저축");

type Props = {
  active: string | null;
  onChange: (cat: string | null) => void;
  /** 정규 전환된 커스텀 카테고리 — '기타' 뒤, 미분류 앞에 끼움 */
  extraCategories?: string[];
};

export function DetailsFilter({ active, onChange, extraCategories = [] }: Props) {
  const idx = BASE_CATEGORIES.indexOf("기타") + 1;
  const categories: string[] = [
    ...BASE_CATEGORIES.slice(0, idx),
    ...extraCategories,
    ...BASE_CATEGORIES.slice(idx),
  ];
  return (
    <div className="flex gap-1.5 px-4 py-2 overflow-x-auto scrollbar-hide">
      <button
        onClick={() => onChange(null)}
        className={
          active === null
            ? "flex-shrink-0 px-3 py-1.5 rounded-chip bg-ink text-white text-[12px] font-bold"
            : "flex-shrink-0 px-3 py-1.5 rounded-chip bg-surface border border-hair text-ink-sub text-[12px] font-semibold"
        }
      >
        전체
      </button>
      {categories.map((c) => {
        const isActive = active === c;
        return (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={
              isActive
                ? "flex-shrink-0 px-3 py-1.5 rounded-chip bg-ink text-white text-[12px] font-bold"
                : "flex-shrink-0 px-3 py-1.5 rounded-chip bg-surface border border-hair text-ink-sub text-[12px] font-semibold"
            }
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}
