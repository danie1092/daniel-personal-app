"use client";

import { useEffect, useState, useTransition } from "react";
import { PAYMENT_METHODS } from "@/lib/constants";
import type { FixedExpense } from "@/lib/budget/fixedExpenses";
import type { Subscription } from "@/lib/budget/subscriptions";
import { tokenOf } from "@/lib/budget/categoryTokens";
import { SubscriptionDeleteButton } from "./SubscriptionDeleteButton";
import {
  createFixedExpense,
  updateFixedExpense,
  deleteFixedExpense,
  registerSubscriptionAsFixed,
} from "./actions";

function won(n: number): string {
  return `${n.toLocaleString()}원`;
}

type SheetState =
  | { mode: "closed" }
  | { mode: "new" }
  | { mode: "edit"; item: FixedExpense };

type Props = {
  items: FixedExpense[];
  /** 자동 감지된 반복 결제 (제외 목록 반영 후) */
  subs: Subscription[];
  /** 감지된 monthly 반복 결제 월 합계 */
  subsTotal: number;
};

export function FixedTab({ items, subs, subsTotal }: Props) {
  const [sheet, setSheet] = useState<SheetState>({ mode: "closed" });
  const total = items.reduce((s, e) => s + e.amount, 0);
  // 이미 고정비에 같은 이름이 있으면 승격 버튼 숨김 (중복 등록 방지)
  const fixedNames = new Set(items.map((i) => i.description));

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

      {/* 자동 감지된 반복 결제 — 최근 결제에서 매달 반복되는 것 */}
      <div className="bg-surface rounded-card p-4 mt-3 border border-hair shadow-card">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[14px] font-bold">자동 감지된 반복 결제</div>
          {subsTotal > 0 && (
            <div className="text-[12px] font-bold text-primary">매달 {won(subsTotal)}</div>
          )}
        </div>
        <div className="text-[11px] text-ink-muted mb-3">
          최근 결제에서 매달 반복되는 것만 자동으로 모았어. 고정비로 올리면 위 목록·예산 타깃에 포함돼.
        </div>

        {subs.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-ink-muted">
            아직 반복 결제가 안 잡혔어.
            <br />
            몇 달 쌓이면 여기 구독·고정지출이 모여.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {subs.map((s, i) => (
              <DetectedSubRow
                key={`${s.name}-${i}`}
                sub={s}
                alreadyFixed={fixedNames.has(s.name)}
              />
            ))}
          </div>
        )}
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

function DetectedSubRow({ sub, alreadyFixed }: { sub: Subscription; alreadyFixed: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const tok = tokenOf(sub.category);

  function promote() {
    setError(null);
    startTransition(async () => {
      const result = await registerSubscriptionAsFixed({
        merchantKey: sub.key,
        description: sub.name,
        amount: sub.typicalAmount,
      });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="py-2 border-b border-hair-light last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-[18px]">{tok.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold truncate">{sub.name}</span>
            {sub.isNew && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[9px] font-bold">
                NEW
              </span>
            )}
          </div>
          <div className="text-[10px] text-ink-muted">
            {sub.cadence === "monthly" ? "매달" : "가끔"} · {sub.months.length}개월 관측
            {" · "}
            {sub.lastDate.slice(5).replace("-", "/")} 최근
          </div>
        </div>
        <div className="text-[13px] font-bold shrink-0">{won(sub.typicalAmount)}</div>
        <SubscriptionDeleteButton merchantKey={sub.key} name={sub.name} />
      </div>
      {!alreadyFixed && (
        <button
          onClick={promote}
          disabled={pending}
          className="mt-1.5 ml-[30px] px-2 py-1 bg-hair-light text-ink-sub rounded-input text-[11px] font-semibold disabled:opacity-50"
        >
          {pending ? "등록 중..." : "📌 고정비로 등록"}
        </button>
      )}
      {error && <p className="mt-1 ml-[30px] text-[11px] text-danger">{error}</p>}
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
