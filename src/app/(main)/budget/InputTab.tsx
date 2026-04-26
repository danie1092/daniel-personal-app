"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { BUDGET_CATEGORIES, PAYMENT_METHODS } from "@/lib/constants";
import { CATEGORY_TOKENS, NO_PAYMENT_CATEGORIES, type BudgetCategory } from "@/lib/budget/categoryTokens";
import { createBudgetEntry } from "./actions";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function InputTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [date, setDate] = useState(todayStr());
  const [category, setCategory] = useState<BudgetCategory>("식사");
  const [description, setDescription] = useState("");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [smsText, setSmsText] = useState("");
  const [pending, startTransition] = useTransition();
  const [smsParsing, setSmsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const noPayment = NO_PAYMENT_CATEGORIES.has(category);

  async function handleParseSms() {
    if (!smsText.trim()) return;
    setSmsParsing(true);
    setError(null);
    try {
      const res = await fetch("/api/budget/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: smsText }),
      });
      const json = await res.json();
      if (json.ok && json.entry) {
        setAmount(String(json.entry.amount));
        setMemo(json.entry.memo ?? "");
        setDate(json.entry.date ?? date);
        if (PAYMENT_METHODS.includes(json.entry.payment_method)) {
          setPaymentMethod(json.entry.payment_method);
        }
        setSmsText("");
      } else {
        setError("SMS 파싱 실패");
      }
    } catch {
      setError("SMS 파싱 중 오류");
    } finally {
      setSmsParsing(false);
    }
  }

  function handleSubmit() {
    setError(null);
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) {
      setError("금액을 정수로 입력하세요");
      return;
    }
    startTransition(async () => {
      const result = await createBudgetEntry({
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
      setAmount("");
      setDescription("");
      setMemo("");
      setSuccess(true);
      setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("tab");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      }, 500);
    });
  }

  return (
    <div className="bg-surface px-5 py-5">
      <div className="mb-5">
        <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-2">
          금액
        </div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="w-full bg-transparent text-[36px] font-extrabold tracking-tight outline-none placeholder:text-ink-muted"
        />
      </div>

      <div className="mb-4">
        <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-2">
          카테고리
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {BUDGET_CATEGORIES.map((c) => {
            const active = category === c;
            const tok = CATEGORY_TOKENS[c];
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={
                  active
                    ? `${tok.bg} ${tok.text} px-2 py-2.5 rounded-input text-[11px] font-bold flex flex-col items-center gap-0.5 ring-2 ring-current`
                    : "bg-hair-light text-ink-sub px-2 py-2.5 rounded-input text-[11px] flex flex-col items-center gap-0.5"
                }
              >
                <span className="text-[16px]">{tok.emoji}</span>
                <span>{c}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!noPayment && (
        <div className="mb-4">
          <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-2">
            결제수단
          </div>
          <div className="flex gap-1.5 flex-wrap">
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

      <div className="mb-4">
        <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-2">
          설명
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="예: 김치찌개"
          maxLength={200}
          className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[13px] outline-none placeholder:text-ink-muted"
        />
      </div>

      <div className="mb-4">
        <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-2">
          메모 (선택)
        </div>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={500}
          rows={2}
          className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[13px] outline-none resize-none"
        />
      </div>

      <div className="mb-4">
        <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-2">
          날짜
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[13px] outline-none"
        />
      </div>

      <div className="mb-4">
        <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-2">
          SMS 붙여넣기
        </div>
        <textarea
          value={smsText}
          onChange={(e) => setSmsText(e.target.value)}
          placeholder="카드 결제 알림 메시지 붙여넣고 자동 채우기"
          rows={2}
          className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[12px] outline-none resize-none"
        />
        <button
          onClick={handleParseSms}
          disabled={smsParsing || !smsText.trim()}
          className="mt-2 px-3 py-1.5 bg-hair text-ink-sub rounded-input text-[12px] font-semibold disabled:opacity-50"
        >
          {smsParsing ? "파싱 중..." : "SMS 파싱"}
        </button>
      </div>

      {error && <p className="text-[12px] text-danger mb-3">{error}</p>}
      {success && <p className="text-[12px] text-success mb-3">저장 완료 → 세부내역으로 이동…</p>}

      <button
        onClick={handleSubmit}
        disabled={pending || !amount.trim()}
        className="w-full py-3.5 bg-primary text-white rounded-input text-[14px] font-bold disabled:opacity-50 shadow-fab"
      >
        {pending ? "저장 중..." : "저장"}
      </button>
    </div>
  );
}
