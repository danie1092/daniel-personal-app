"use client";

import { useEffect, useState, useTransition } from "react";
import { BUDGET_TARGETS } from "@/lib/constants";
import { tokenOf } from "@/lib/budget/categoryTokens";
import type { BudgetOverride } from "@/lib/budget/plans";
import type { CustomCategory } from "@/lib/budget/customCategories";
import {
  upsertBudgetPlan,
  deleteBudgetPlan,
  convertPlanToRegular,
  removeCustomCategory,
} from "./actions";

function won(n: number): string {
  return `${n.toLocaleString()}원`;
}

type PlanLine = {
  category: string;
  amount: number;
  /**
   * default = 기본 카테고리, custom = 정규 전환된 커스텀 카테고리,
   * special = 그 달에만 있는 특별예산
   */
  kind: "default" | "custom" | "special";
  /** 오버라이드 없을 때의 기본 금액 (special은 null) */
  defaultAmount: number | null;
  overridden: boolean;
};

function buildLines(overrides: BudgetOverride[], customs: CustomCategory[]): PlanLine[] {
  const defaults = BUDGET_TARGETS as Record<string, number>;
  const overrideMap = new Map(overrides.map((o) => [o.category, o.amount]));
  const customNames = new Set(customs.map((c) => c.name));

  const lines: PlanLine[] = Object.keys(defaults).map((category) => ({
    category,
    amount: overrideMap.get(category) ?? defaults[category],
    kind: "default",
    defaultAmount: defaults[category],
    overridden: overrideMap.has(category),
  }));
  // 정규 전환된 커스텀 카테고리 — 매월 자동 포함, 기본값은 전환 시점 금액
  for (const c of customs) {
    lines.push({
      category: c.name,
      amount: overrideMap.get(c.name) ?? c.amount,
      kind: "custom",
      defaultAmount: c.amount,
      overridden: overrideMap.has(c.name),
    });
  }
  // 특별예산 (기본에도 커스텀에도 없는 이름)
  for (const o of overrides) {
    if (!(o.category in defaults) && !customNames.has(o.category) && o.category !== "고정비") {
      lines.push({
        category: o.category,
        amount: o.amount,
        kind: "special",
        defaultAmount: null,
        overridden: true,
      });
    }
  }
  return lines.sort((a, b) => b.amount - a.amount);
}

type Props = {
  /** 편성 대상 사이클 (다음달, YYYY-MM) */
  nextYearMonth: string;
  overrides: BudgetOverride[];
  /** 고정비 탭 합계 — 읽기 전용 표시용 */
  fixedTotal: number;
  /** 다음달 사이클에 적용되는 정규 커스텀 카테고리 */
  customCategories: CustomCategory[];
};

export function NextMonthPlan({ nextYearMonth, overrides, fixedTotal, customCategories }: Props) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<PlanLine | "new" | null>(null);

  const lines = buildLines(overrides, customCategories);
  const variableTotal = lines.reduce((s, l) => s + l.amount, 0);
  const month = Number(nextYearMonth.split("-")[1]);

  return (
    <div className="bg-surface rounded-card border border-hair shadow-card mt-3 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div>
          <div className="text-[14px] font-bold">{month}월 예산 편성</div>
          <div className="text-[11px] text-ink-muted mt-0.5">
            변동 {won(variableTotal)} + 고정 {won(fixedTotal)} = 총 {won(variableTotal + fixedTotal)}
          </div>
        </div>
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          className={open ? "rotate-180 transition-transform" : "transition-transform"}
        >
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="text-[11px] text-ink-muted mb-2">
            항목을 누르면 {month}월 예산을 미리 조정할 수 있어요 (이번 달은 잠김)
          </div>
          <div className="flex flex-col">
            {lines.map((l) => {
              const tok = tokenOf(l.category);
              return (
                <button
                  key={l.category}
                  onClick={() => setSheet(l)}
                  className="flex items-center justify-between py-2 border-b border-hair-light text-left active:opacity-70"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[14px]">{l.kind === "special" ? "🎁" : tok.emoji}</span>
                    <span className="text-[13px] font-semibold truncate">{l.category}</span>
                    {l.kind === "special" && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[9px] font-bold">특별</span>
                    )}
                    {l.kind === "custom" && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[9px] font-bold">정규·매월</span>
                    )}
                    {l.overridden && l.kind !== "special" && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-primary-soft text-primary text-[9px] font-bold">수정됨</span>
                    )}
                  </div>
                  <div className="text-[13px] font-bold shrink-0 ml-3">{won(l.amount)}</div>
                </button>
              );
            })}
            {/* 고정비 — 읽기 전용 */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px]">📌</span>
                <span className="text-[13px] font-semibold text-ink-sub">고정비</span>
                <span className="px-1.5 py-0.5 rounded-full bg-hair-light text-ink-muted text-[9px] font-bold">고정비 탭에서 관리</span>
              </div>
              <div className="text-[13px] font-bold text-ink-sub">{won(fixedTotal)}</div>
            </div>
          </div>

          <button
            onClick={() => setSheet("new")}
            className="w-full mt-2 py-2.5 bg-hair-light text-ink-sub rounded-input text-[13px] font-bold"
          >
            + 특별예산 추가 (예: 부모님 생신)
          </button>
        </div>
      )}

      {sheet !== null && (
        <PlanEditSheet
          nextYearMonth={nextYearMonth}
          line={sheet === "new" ? null : sheet}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

function PlanEditSheet({
  nextYearMonth,
  line,
  onClose,
}: {
  nextYearMonth: string;
  line: PlanLine | null; // null = 새 특별예산
  onClose: () => void;
}) {
  const [category, setCategory] = useState(line?.category ?? "");
  const [amount, setAmount] = useState(line ? String(line.amount) : "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isSpecial = line === null || line.kind === "special";
  const month = Number(nextYearMonth.split("-")[1]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  function handleSave() {
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt < 0) {
      setError("금액을 0 이상 정수로 입력하세요");
      return;
    }
    run(() => upsertBudgetPlan(nextYearMonth, category, amt));
  }

  /** 기본/정규 카테고리면 기본값 복귀, 특별예산이면 항목 삭제 */
  function handleReset() {
    if (!line) return;
    const msg = line.defaultAmount !== null
      ? `기본값(${line.defaultAmount.toLocaleString()}원)으로 되돌릴까요?`
      : `'${line.category}' 특별예산을 삭제할까요?`;
    if (!confirm(msg)) return;
    run(() => deleteBudgetPlan(nextYearMonth, line.category));
  }

  /** 특별예산 → 정규(매월 반복) 전환 */
  function handleConvert() {
    if (!line) return;
    if (
      !confirm(
        `'${line.category}'을(를) 정규 카테고리로 전환할까요?\n${month}월부터 매달 예산에 자동으로 들어가고, 지출 입력 카테고리에도 추가돼요.`
      )
    )
      return;
    run(() => convertPlanToRegular(nextYearMonth, line.category));
  }

  /** 정규 전환된 커스텀 카테고리 제거 */
  function handleRemoveCustom() {
    if (!line) return;
    if (!confirm(`'${line.category}' 정규 카테고리를 삭제할까요?\n다음 달부터 예산에서 빠져요 (기존 지출 기록은 유지).`)) return;
    run(() => removeCustomCategory(line.category));
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 bg-surface rounded-t-sheet max-h-[85dvh] flex flex-col overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hair-light">
          <h2 className="text-[16px] font-bold">
            {line ? `${month}월 · ${line.category}` : `${month}월 특별예산 추가`}
          </h2>
          <button onClick={onClose} className="text-[13px] text-ink-sub">닫기</button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 flex flex-col gap-3">
          {!line && (
            <div>
              <label className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">이름</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="예: 부모님 생신"
                maxLength={30}
                className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[13px] mt-1"
              />
            </div>
          )}

          <div>
            <label className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">
              {month}월 예산 금액
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full bg-hair-light rounded-input px-3 py-2.5 text-[18px] font-bold mt-1"
            />
            {line?.defaultAmount != null && (
              <div className="text-[11px] text-ink-muted mt-1">기본값 {won(line.defaultAmount)}</div>
            )}
          </div>

          {line?.kind === "special" && (
            <button
              onClick={handleConvert}
              disabled={pending}
              className="w-full py-2.5 bg-rose-50 text-rose-700 rounded-input text-[13px] font-bold disabled:opacity-50"
            >
              🔁 정규 카테고리로 전환 (매월 자동 포함)
            </button>
          )}

          {line?.kind === "custom" && (
            <button
              onClick={handleRemoveCustom}
              disabled={pending}
              className="w-full py-2 text-[12px] text-ink-muted underline underline-offset-2 disabled:opacity-50"
            >
              정규 카테고리에서 삭제 (매월 반복 해제)
            </button>
          )}

          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>

        <div className="px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-hair-light flex gap-2">
          {line && line.overridden && (
            <button
              onClick={handleReset}
              disabled={pending}
              className="flex-1 py-2.5 bg-danger-soft text-danger rounded-input text-[13px] font-bold disabled:opacity-50"
            >
              {isSpecial ? "삭제" : "기본값으로"}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={pending || !amount.trim() || (!line && !category.trim())}
            className="flex-[2] py-2.5 bg-primary text-white rounded-input text-[13px] font-bold disabled:opacity-50"
          >
            {pending ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
