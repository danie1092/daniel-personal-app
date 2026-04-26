"use client";

import { useState } from "react";
import type { BudgetEntry } from "@/lib/budget/monthData";
import { CATEGORY_TOKENS, type BudgetCategory } from "@/lib/budget/categoryTokens";
import { EntryEditSheet } from "./EntryEditSheet";

export function EntryRow({ entry }: { entry: BudgetEntry }) {
  const [open, setOpen] = useState(false);
  const tok = CATEGORY_TOKENS[entry.category as BudgetCategory];
  const isIncome = entry.type === "income";
  const time = new Date(entry.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 py-2.5 active:opacity-60 text-left"
      >
        <div className={`w-9 h-9 rounded-input ${tok.bg} ${tok.text} flex items-center justify-center text-[16px] flex-shrink-0`}>
          {tok.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold truncate">
            {entry.description || entry.category}
          </div>
          <div className="text-[11px] text-ink-muted truncate">
            {entry.category}
            {entry.payment_method && ` · ${entry.payment_method}`}
            {` · ${time}`}
          </div>
        </div>
        <div className={isIncome ? "text-[14px] font-bold text-success" : "text-[14px] font-bold text-ink"}>
          {isIncome ? "+" : ""}{entry.amount.toLocaleString()}원
        </div>
      </button>
      {open && <EntryEditSheet entry={entry} onClose={() => setOpen(false)} />}
    </>
  );
}
