"use client";

import { useState, useTransition } from "react";
import { toggleRoutineCheck } from "./actions";
import { playCheckSound } from "@/lib/acSound";

type Props = {
  itemId: string;
  name: string;
  emoji: string;
  date: string;
  initialChecked: boolean;
  isLast: boolean;
};

export function CheckRow({ itemId, name, emoji, date, initialChecked, isLast }: Props) {
  const [checked, setChecked] = useState(initialChecked);
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    if (pending) return;
    const next = !checked;
    setChecked(next); // 낙관적
    if (next) playCheckSound();
    startTransition(async () => {
      const r = await toggleRoutineCheck(itemId, date, next);
      if (!r.ok) setChecked(!next); // 롤백
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      className={
        "w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 disabled:opacity-60 " +
        (isLast ? "" : "border-b border-hair-light ") +
        (checked ? "bg-hair-light" : "bg-surface")
      }
    >
      <span className="text-[24px] leading-none w-8 text-center">{emoji}</span>
      <span className={
        checked
          ? "flex-1 text-[14px] font-medium text-ink-muted line-through"
          : "flex-1 text-[14px] font-medium text-ink"
      }>
        {name}
      </span>
      <span className={
        checked
          ? "w-5 h-5 rounded-full bg-success border-2 border-success flex items-center justify-center"
          : "w-5 h-5 rounded-full border-2 border-hair flex items-center justify-center"
      }>
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
    </button>
  );
}
