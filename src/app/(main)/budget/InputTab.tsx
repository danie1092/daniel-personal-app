"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { PAYMENT_METHODS } from "@/lib/constants";
import { tokenOf, expensePickerOrder } from "@/lib/budget/categoryTokens";
import { createBudgetEntry } from "./actions";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 상단 유형 선택 — 저축·월급은 지출 카테고리와 분리해서 관리 */
type EntryKind = "expense" | "saving" | "income";

const ENTRY_KINDS: { key: EntryKind; label: string; category: string | null }[] = [
  { key: "expense", label: "지출", category: null },
  { key: "saving", label: "저축", category: "저축" },
  { key: "income", label: "월급", category: "월급" },
];

export function InputTab({ customCategories = [] }: { customCategories?: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [date, setDate] = useState(todayStr());
  const [kind, setKind] = useState<EntryKind>("expense");
  const [category, setCategory] = useState<string>("외식");
  const [description, setDescription] = useState("");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [smsText, setSmsText] = useState("");
  const [pending, startTransition] = useTransition();
  const [smsParsing, setSmsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isExpense = kind === "expense";
  const effectiveCategory = isExpense
    ? category
    : (ENTRY_KINDS.find((k) => k.key === kind)?.category ?? category);

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
        category: effectiveCategory,
        description,
        memo,
        amount: amt,
        paymentMethod: isExpense ? paymentMethod : null,
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
          유형
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {ENTRY_KINDS.map((k) => {
            const active = kind === k.key;
            const tok = k.category ? tokenOf(k.category) : null;
            return (
              <button
                key={k.key}
                onClick={() => setKind(k.key)}
                className={
                  active
                    ? `${tok ? `${tok.bg} ${tok.text}` : "bg-ink text-white"} px-2 py-2.5 rounded-input text-[12px] font-bold flex items-center justify-center gap-1 ring-2 ring-current`
                    : "bg-hair-light text-ink-sub px-2 py-2.5 rounded-input text-[12px] font-semibold flex items-center justify-center gap-1"
                }
              >
                {tok && <span className="text-[14px]">{tok.emoji}</span>}
                {!tok && <span className="text-[14px]">💸</span>}
                <span>{k.label}</span>
              </button>
            );
          })}
        </div>
      </div>

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

      {isExpense && (
      <div className="mb-4">
        <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-2">
          카테고리
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {expensePickerOrder(customCategories).map((c) => {
            const active = category === c;
            const tok = tokenOf(c);
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
      )}

      {isExpense && (
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
          placeholder={isExpense ? "예: 김치찌개" : kind === "saving" ? "예: 적금 이체" : "예: 7월 월급"}
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

      {isExpense && (
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
      )}

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
