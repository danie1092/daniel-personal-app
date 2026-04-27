"use client";

import { useState, useTransition } from "react";
import type { CurationItem } from "@/lib/curation/data";
import { CURATION_CATEGORIES, type CurationCategory } from "@/lib/curation/categories";
import { updateCurationCategory, deleteCuration, reprocessCuration } from "./actions";

type Props = {
  item: CurationItem | null;
  onClose: () => void;
};

export function CurationEditSheet({ item, onClose }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CurationCategory | null>(item?.category ?? null);

  if (!item) return null;

  const isDeadLetter = !item.summary;

  function applyCategory(cat: CurationCategory) {
    setSelected(cat);
    setError(null);
    startTransition(async () => {
      const r = await updateCurationCategory(item!.id, cat);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  function handleDelete() {
    if (!confirm("이 항목을 삭제할까요?")) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteCuration(item!.id);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  function handleReprocess() {
    setError(null);
    startTransition(async () => {
      const r = await reprocessCuration(item!.id);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full bg-surface rounded-t-sheet p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-hair rounded-full mx-auto mb-4" />

        {!isDeadLetter && (
          <>
            <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-2">
              카테고리 변경
            </div>
            <div className="flex flex-wrap gap-1.5 mb-5">
              {CURATION_CATEGORIES.map((c) => (
                <button
                  key={c}
                  disabled={pending}
                  onClick={() => applyCategory(c)}
                  className={
                    selected === c
                      ? "text-[12px] px-3 py-1.5 bg-primary text-white rounded-input font-bold"
                      : "text-[12px] px-3 py-1.5 bg-hair-light text-ink-sub rounded-input font-semibold"
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2">
          <button
            disabled={pending}
            onClick={handleReprocess}
            className="flex-1 text-[13px] py-2.5 bg-ink text-white rounded-btn font-bold disabled:opacity-50"
          >
            {isDeadLetter ? "재처리" : "다시 분류"}
          </button>
          <button
            disabled={pending}
            onClick={handleDelete}
            className="flex-1 text-[13px] py-2.5 bg-danger-soft text-danger rounded-btn font-bold disabled:opacity-50"
          >
            삭제
          </button>
        </div>

        {error && <p className="text-[12px] text-danger mt-3">{error}</p>}
      </div>
    </div>
  );
}
