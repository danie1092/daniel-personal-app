"use client";

import { useState } from "react";
import Link from "next/link";
import type { BudgetEntry, MonthSummary } from "@/lib/budget/monthData";
import { DetailsFilter } from "./DetailsFilter";
import { EntryRow } from "./EntryRow";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function formatDayHeader(dateStr: string, today: string): string {
  if (dateStr === today) return `오늘 · ${formatDate(dateStr)}`;
  const t = new Date(today);
  t.setDate(t.getDate() - 1);
  const yesterday = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  if (dateStr === yesterday) return `어제 · ${formatDate(dateStr)}`;
  return formatDate(dateStr);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}

function getSpendingComment(amount: number, budget: number): string {
  if (amount === 0) return "무지출 챌린지!";
  const pct = amount / budget;
  if (pct <= 0.3) return "이번달도 아껴쓰자!";
  if (pct <= 0.6) return "슬슬 조심해야겠는걸";
  if (pct <= 0.85) return "좀만 더 아끼자...!";
  if (pct <= 1.0) return "미쳤냐?";
  return "거지가 되고싶냐?";
}

type Props = {
  entries: BudgetEntry[];
  summary: MonthSummary;
  todayStr: string;
};

export function DetailsTab({ entries, summary, todayStr }: Props) {
  // Category filter is purely client-side: clicking chips re-filters the
  // already-loaded `entries` array instead of triggering a server round-trip.
  const [filter, setFilter] = useState<string | null>(null);
  const visible = filter ? entries.filter((e) => e.category === filter) : entries;

  const groups = new Map<string, BudgetEntry[]>();
  for (const e of visible) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date)!.push(e);
  }

  const pct = Math.min(summary.spending / summary.monthlyBudget, 1);
  const comment = getSpendingComment(summary.spending, summary.monthlyBudget);
  const overBudget = pct >= 0.85;

  return (
    <div>
      <div className="bg-surface px-5 py-5 border-b border-hair-light">
        <div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase mb-1">
          {summary.yearMonth.split("-")[1]}월 지출
        </div>
        <div className="text-[32px] font-extrabold tracking-tight leading-none">
          {summary.spending.toLocaleString()}원
        </div>
        <div className="text-[12px] text-ink-muted mt-1">
          / 예산 {summary.monthlyBudget.toLocaleString()}원
        </div>
        <div className="h-2 bg-hair-light rounded-full mt-3 overflow-hidden">
          <div
            className={overBudget ? "h-full bg-warning rounded-full" : "h-full bg-primary rounded-full"}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
        <div className="text-[12px] text-ink-sub mt-1.5">
          예산의 {Math.round(pct * 100)}% 사용 · {comment}
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-hair-light">
          <div className="text-center">
            <div className="text-[10px] text-ink-muted mb-1">월급</div>
            <div className="text-[13px] font-bold text-success">
              {summary.income.toLocaleString()}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-ink-muted mb-1">저축</div>
            <div className="text-[13px] font-bold text-primary">
              {summary.saving.toLocaleString()}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-ink-muted mb-1">잔액</div>
            <div className="text-[13px] font-bold">
              {summary.remaining.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface">
        <DetailsFilter active={filter} onChange={setFilter} />
      </div>

      <div className="bg-surface px-4">
        {visible.length === 0 ? (
          <div className="py-12 text-center text-[12px] text-ink-muted">
            {filter ? `${filter} 항목이 없어요` : "이번 달 지출이 아직 없어요"}
          </div>
        ) : (
          Array.from(groups.entries()).map(([date, list]) => {
            const dayTotal = list.reduce((s, e) => s + (e.type === "income" ? -e.amount : e.amount), 0);
            return (
              <div key={date} className="py-3 border-b border-hair-light last:border-b-0">
                <div className="flex items-baseline justify-between mb-1">
                  <div className="text-[12px] font-bold">{formatDayHeader(date, todayStr)}</div>
                  <div className="text-[12px] text-ink-sub font-semibold">
                    {dayTotal < 0 ? "+" : ""}{Math.abs(dayTotal).toLocaleString()}원
                  </div>
                </div>
                {list.map((e) => <EntryRow key={e.id} entry={e} />)}
              </div>
            );
          })
        )}
      </div>

      <div className="bg-surface px-4 py-4">
        <Link
          href="/budget?tab=input"
          className="block w-full py-3.5 bg-primary text-white rounded-input text-[14px] font-bold text-center shadow-fab"
        >
          + 빠른 입력
        </Link>
      </div>
    </div>
  );
}
