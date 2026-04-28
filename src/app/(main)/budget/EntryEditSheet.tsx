"use client";

import { useEffect, useState, useTransition } from "react";
import { BUDGET_CATEGORIES, PAYMENT_METHODS } from "@/lib/constants";
import type { BudgetEntry } from "@/lib/budget/monthData";
import { CATEGORY_TOKENS, NO_PAYMENT_CATEGORIES, type BudgetCategory } from "@/lib/budget/categoryTokens";
import { updateBudgetEntry, deleteBudgetEntry } from "./actions";

type Props = {
  entry: BudgetEntry;
  onClose: () => void;
};

export function EntryEditSheet({ entry, onClose }: Props) {
  const [date, setDate] = useState(entry.date);
  const [category, setCategory] = useState<BudgetCategory>(entry.category);
  const [description, setDescription] = useState(entry.description ?? "");
  const [memo, setMemo] = useState(entry.memo ?? "");
  const [amount, setAmount] = useState(String(entry.amount));
  const [paymentMethod, setPaymentMethod] = useState<string>(entry.payment_method ?? PAYMENT_METHODS[0]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const noPayment = NO_PAYMENT_CATEGORIES.has(category);

  // Lock body scroll while sheet is open so swipe-up gestures don't bleed
  // through to the page underneath (iOS Safari scroll chaining).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function handleSave() {
    setError(null);
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) {
      setError("금액을 정수로 입력하세요");
      return;
    }
    startTransition(async () => {
      const result = await updateBudgetEntry(entry.id, {
        date,
        category,
        description,
        memo,
        amount: amt,
        paymentMethod: noPayment ? null : paymentMethod,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  function handleDelete() {
    if (!confirm("이 항목을 삭제할까요?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteBudgetEntry(entry.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 bg-surface rounded-t-sheet max-h-[85dvh] flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hair-light">
          <h2 className="text-[16px] font-bold">항목 수정</h2>
          <button onClick={onClose} className="text-[13px] text-ink-sub">닫기</button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 flex flex-col gap-3">
          <div>
            <label className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">금액</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[18px] font-bold mt-1"
            />
          </div>

          <div>
            <label className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">카테고리</label>
            <div className="grid grid-cols-4 gap-1.5 mt-1.5">
              {BUDGET_CATEGORIES.map((c) => {
                const active = category === c;
                const tok = CATEGORY_TOKENS[c];
                return (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={
                      active
                        ? `${tok.bg} ${tok.text} px-2 py-2 rounded-input text-[12px] font-bold flex flex-col items-center gap-0.5`
                        : "bg-hair-light text-ink-sub px-2 py-2 rounded-input text-[12px] flex flex-col items-center gap-0.5"
                    }
                  >
                    <span className="text-[14px]">{tok.emoji}</span>
                    <span>{c}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {!noPayment && (
            <div>
              <label className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">결제수단</label>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {PAYMENT_METHODS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPaymentMethod(p)}
                    className={
                      paymentMethod === p
                        ? "px-3 py-1.5 rounded-input bg-ink text-white text-[12px] font-bold"
                        : "px-3 py-1.5 rounded-input bg-hair-light text-ink-sub text-[12px] font-semibold"
                    }
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">설명</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[13px] mt-1"
            />
          </div>

          <div>
            <label className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">메모</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={500}
              rows={2}
              className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[13px] resize-none mt-1"
            />
          </div>

          <div>
            <label className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[13px] mt-1"
            />
          </div>

          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>

        <div className="px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-hair-light flex gap-2">
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
