"use client";

import { useState, useTransition } from "react";
import { addFixedExpenses } from "./actions";

export function FixedExpenseButton({ yearMonth }: { yearMonth: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const r = await addFixedExpenses(yearMonth);
      if (r.ok) {
        setResult(r.added > 0 ? `${r.added}개 추가됨${r.skipped > 0 ? ` (${r.skipped}개 스킵)` : ""}` : "이미 모두 있어요");
      } else {
        setResult(`오류: ${r.error}`);
      }
    });
  }

  return (
    <div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
      <div className="text-[14px] font-bold mb-1">고정지출 일괄 추가</div>
      <div className="text-[12px] text-ink-sub mb-3">
        이번 달 고정지출(보험, 통신비, 관리비 등)을 일괄 추가. 이미 있는 항목은 스킵.
      </div>
      <button
        onClick={handleClick}
        disabled={pending}
        className="px-4 py-2 bg-ink text-white rounded-input text-[12px] font-bold disabled:opacity-50"
      >
        {pending ? "추가 중..." : "일괄 추가"}
      </button>
      {result && <div className="text-[12px] text-ink-sub mt-2">{result}</div>}
    </div>
  );
}
