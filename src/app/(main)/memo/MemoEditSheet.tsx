"use client";

import { useState, useTransition } from "react";
import { MEMO_TAGS } from "@/lib/constants";
import type { MemoEntry } from "@/lib/memo/list";
import { updateMemo, deleteMemo } from "./actions";

type Props = {
  memo: MemoEntry;
  onClose: () => void;
};

export function MemoEditSheet({ memo, onClose }: Props) {
  const [content, setContent] = useState(memo.content);
  const [tag, setTag] = useState<string>(memo.tag);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const text = content.trim();
    if (!text) {
      setError("내용을 입력하세요");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await updateMemo(memo.id, { content: text, tag });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    });
  }

  function handleDelete() {
    if (!confirm("이 메모를 삭제할까요?")) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteMemo(memo.id);
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
          <h2 className="text-[16px] font-bold">메모 수정</h2>
          <button onClick={onClose} className="text-[13px] text-ink-sub">닫기</button>
        </div>

        <div className="px-4 py-4 flex flex-col gap-3 overflow-y-auto">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            maxLength={8192}
            autoFocus
            className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[13px] outline-none resize-none"
          />

          <div className="flex gap-1.5 flex-wrap">
            {MEMO_TAGS.map((t) => (
              <button
                key={t}
                onClick={() => setTag(t)}
                className={
                  tag === t
                    ? "px-2.5 py-1 rounded-chip bg-ink text-white text-[11px] font-bold"
                    : "px-2.5 py-1 rounded-chip bg-hair-light text-ink-sub text-[11px]"
                }
              >
                {t}
              </button>
            ))}
          </div>

          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-hair-light flex gap-2">
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
        </div>
      </div>
    </div>
  );
}
