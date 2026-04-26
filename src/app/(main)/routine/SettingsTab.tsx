"use client";

import { useState, useTransition } from "react";
import type { RoutineItem } from "@/lib/routine/today";
import { deleteRoutineItem, moveRoutineItem } from "./actions";
import { ItemEditSheet } from "./ItemEditSheet";

type SheetState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: RoutineItem };

export function SettingsTab({ items }: { items: RoutineItem[] }) {
  const [sheet, setSheet] = useState<SheetState>({ mode: "closed" });
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function handleDelete(id: string) {
    if (!confirm("이 항목을 삭제할까요?")) return;
    setPendingId(id);
    startTransition(async () => {
      await deleteRoutineItem(id);
      setPendingId(null);
    });
  }

  function handleMove(id: string, direction: "up" | "down") {
    setPendingId(id);
    startTransition(async () => {
      await moveRoutineItem(id, direction);
      setPendingId(null);
    });
  }

  return (
    <div className="px-4 py-3">
      <div className="bg-surface rounded-card mb-3 border border-hair shadow-card overflow-hidden">
        {items.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-[13px] text-ink-muted mb-3">루틴 항목이 없어요</p>
          </div>
        ) : (
          items.map((item, i) => (
            <div
              key={item.id}
              className={
                "flex items-center gap-2 px-4 py-3 " +
                (i < items.length - 1 ? "border-b border-hair-light " : "") +
                (pending && pendingId === item.id ? "opacity-50" : "")
              }
            >
              <span className="text-[20px]">{item.emoji}</span>
              <span className="flex-1 text-[14px] font-medium">{item.name}</span>
              <button
                onClick={() => handleMove(item.id, "up")}
                disabled={pending || i === 0}
                aria-label="위로"
                className="w-7 h-7 flex items-center justify-center text-ink-muted disabled:opacity-30 active:opacity-50"
              >▲</button>
              <button
                onClick={() => handleMove(item.id, "down")}
                disabled={pending || i === items.length - 1}
                aria-label="아래로"
                className="w-7 h-7 flex items-center justify-center text-ink-muted disabled:opacity-30 active:opacity-50"
              >▼</button>
              <button
                onClick={() => setSheet({ mode: "edit", item })}
                className="text-[11px] text-primary px-2 py-1 font-semibold"
              >수정</button>
              <button
                onClick={() => handleDelete(item.id)}
                disabled={pending}
                className="text-[11px] text-danger px-2 py-1 font-semibold disabled:opacity-50"
              >삭제</button>
            </div>
          ))
        )}
      </div>

      <button
        onClick={() => setSheet({ mode: "create" })}
        className="w-full py-3 bg-primary text-white rounded-input text-[13px] font-bold shadow-fab"
      >
        + 항목 추가
      </button>

      {sheet.mode === "create" && (
        <ItemEditSheet mode="create" onClose={() => setSheet({ mode: "closed" })} />
      )}
      {sheet.mode === "edit" && (
        <ItemEditSheet
          mode="edit"
          itemId={sheet.item.id}
          initialName={sheet.item.name}
          initialEmoji={sheet.item.emoji}
          onClose={() => setSheet({ mode: "closed" })}
        />
      )}
    </div>
  );
}
