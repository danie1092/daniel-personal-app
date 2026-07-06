"use client";

import { useEffect, useState, useTransition } from "react";
import { PAYMENT_METHODS } from "@/lib/constants";
import type { FixedExpense } from "@/lib/budget/fixedExpenses";
import { createFixedExpense, updateFixedExpense, deleteFixedExpense } from "./actions";

function won(n: number): string {
  return `${n.toLocaleString()}원`;
}

type SheetState =
  | { mode: "closed" }
  | { mode: "new" }
  | { mode: "edit"; item: FixedExpense };

export function FixedTab({ items }: { items: FixedExpense[] }) {
  const [sheet, setSheet] = useState<SheetState>({ mode: "closed" });
  const total = items.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="px-4 py-3">
      <div className="bg-surface rounded-card p-4 border border-hair shadow-card">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[14px] font-bold">고정비 항목</div>
          <div className="text-[14px] font-extrabold text-primary">매달 {won(total)}</div>
        </div>
        <div className="text-[11px] text-ink-muted mb-3">
          이 합계가 예산 탭의 고정비 타깃이자 총예산의 고정비 몫이 돼요
        </div>

        {items.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-ink-muted">
            아직 고정비 항목이 없어요
          </div>
        ) : (
          <div className="flex flex-col">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => setSheet({ mode: "edit", item })}
                className="flex items-center justify-between py-2.5 border-b border-hair-light last:border-0 text-left active:opacity-70"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate">{item.description}</div>
                  {item.payment_method && (
                    <div className="text-[10px] text-ink-muted mt-0.5">{item.payment_method}</div>
                  )}
                </div>
                <div className="text-[13px] font-bold shrink-0 ml-3">{won(item.amount)}</div>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setSheet({ mode: "new" })}
          className="w-full mt-3 py-2.5 bg-hair-light text-ink-sub rounded-input text-[13px] font-bold"
        >
          + 항목 추가
        </button>
      </div>

      {sheet.mode !== "closed" && (
        <FixedExpenseSheet
          item={sheet.mode === "edit" ? sheet.item : null}
          onClose={() => setSheet({ mode: "closed" })}
        />
      )}
    </div>
  );
}

function FixedExpenseSheet({ item, onClose }: { item: FixedExpense | null; onClose: () => void }) {
  const [description, setDescription] = useState(item?.description ?? "");
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [paymentMethod, setPaymentMethod] = useState<string>(
    item?.payment_method ?? PAYMENT_METHODS[0]
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 시트 열린 동안 바닥 스크롤 잠금 (EntryEditSheet와 동일)
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
      const input = { description, amount: amt, paymentMethod };
      const result = item
        ? await updateFixedExpense(item.id, input)
        : await createFixedExpense(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  function handleDelete() {
    if (!item) return;
    if (!confirm(`'${item.description}' 항목을 삭제할까요?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteFixedExpense(item.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 bg-surface rounded-t-sheet max-h-[85dvh] flex flex-col overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hair-light">
          <h2 className="text-[16px] font-bold">{item ? "고정비 수정" : "고정비 추가"}</h2>
          <button onClick={onClose} className="text-[13px] text-ink-sub">닫기</button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-3 flex flex-col gap-3">
          <div>
            <label className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">이름</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="예: 통신비"
              maxLength={200}
              className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[13px] mt-1"
            />
          </div>

          <div>
            <label className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">월 금액</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[18px] font-bold mt-1"
            />
          </div>

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

          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>

        <div className="px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-hair-light flex gap-2">
          {item && (
            <button
              onClick={handleDelete}
              disabled={pending}
              className="flex-1 py-2.5 bg-danger-soft text-danger rounded-input text-[13px] font-bold disabled:opacity-50"
            >
              삭제
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={pending || !description.trim() || !amount.trim()}
            className="flex-[2] py-2.5 bg-primary text-white rounded-input text-[13px] font-bold disabled:opacity-50"
          >
            {pending ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
