"use client";

import { useState, useTransition } from "react";
import { createRoutineItem, updateRoutineItem } from "./actions";

type Props = {
  mode: "create" | "edit";
  initialName?: string;
  initialEmoji?: string;
  itemId?: string;
  onClose: () => void;
};

export function ItemEditSheet({ mode, initialName = "", initialEmoji = "✅", itemId, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const [emoji, setEmoji] = useState(initialEmoji);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!name.trim()) {
      setError("이름을 입력하세요");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createRoutineItem({ name, emoji })
          : await updateRoutineItem(itemId!, { name, emoji });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mt-auto bg-surface rounded-t-sheet flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hair-light">
          <h2 className="text-[16px] font-bold">{mode === "create" ? "항목 추가" : "항목 수정"}</h2>
          <button onClick={onClose} className="text-[13px] text-ink-sub">닫기</button>
        </div>

        <div className="px-4 py-4 flex flex-col gap-3">
          <div>
            <label className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">이모지</label>
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={16}
              placeholder="✅"
              className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[20px] mt-1 text-center"
            />
          </div>

          <div>
            <label className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">이름</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="예: 30분 운동"
              autoFocus
              className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[14px] mt-1"
            />
          </div>

          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-hair-light">
          <button
            onClick={handleSave}
            disabled={pending}
            className="w-full py-3 bg-primary text-white rounded-input text-[13px] font-bold disabled:opacity-50"
          >
            {pending ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
