import { Suspense } from "react";
import {
  getMonthEntries,
  getMonthSummary,
  getCategoryBreakdown,
  getRecentCycleSpending,
} from "@/lib/budget/monthData";
import { BudgetMonthSelector } from "./BudgetMonthSelector";
import { BudgetTabs, type BudgetTab } from "./BudgetTabs";
import { DetailsTab } from "./DetailsTab";
import { InputTab } from "./InputTab";
import { SummaryTab } from "./SummaryTab";
import { SubscriptionsTab } from "./SubscriptionsTab";
import { BudgetTrackerTab } from "./BudgetTrackerTab";
import {
  getRecentEntries,
  detectSubscriptions,
  monthlySubscriptionTotal,
  getSubscriptionExclusions,
} from "@/lib/budget/subscriptions";
import { buildBudgetTracker } from "@/lib/budget/budgetTracker";
import { budgetMonthOf, nextBudgetMonth } from "@/lib/budget/cycle";
import { getFixedExpenses, fixedExpensesTotal } from "@/lib/budget/fixedExpenses";
import { getBudgetOverrides, effectiveVariableTargets } from "@/lib/budget/plans";
import { FixedTab } from "./FixedTab";

export const dynamic = "force-dynamic";

function currentYearMonth(): string {
  return budgetMonthOf(new Date());
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const YM_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

type SearchParams = Promise<{
  ym?: string;
  tab?: string;
}>;

export default async function BudgetPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const yearMonth = params.ym && YM_REGEX.test(params.ym) ? params.ym : currentYearMonth();
  const rawTab = params.tab;
  const tab: BudgetTab =
    rawTab === "input" || rawTab === "summary" || rawTab === "subs" ||
    rawTab === "tracker" || rawTab === "fixed"
      ? rawTab
      : "details";

  const needsMonthEntries = tab === "details";
  const needsBreakdown = tab === "summary" || tab === "tracker";
  const needsFixedItems = tab === "fixed" || tab === "tracker";
  // 다음달 편성은 항상 "실제 현재 사이클"의 다음 달 (과거 달을 보고 있어도)
  const nextYm = nextBudgetMonth(currentYearMonth());
  const [entries, summary, breakdown, recentForSubs, trend, fixedItems, exclusions, overrides, nextOverrides] =
    await Promise.all([
      needsMonthEntries ? getMonthEntries(yearMonth) : Promise.resolve([]),
      getMonthSummary(yearMonth),
      needsBreakdown ? getCategoryBreakdown(yearMonth) : Promise.resolve([]),
      tab === "subs" ? getRecentEntries(4) : Promise.resolve([]),
      tab === "summary" ? getRecentCycleSpending(yearMonth) : Promise.resolve([]),
      needsFixedItems ? getFixedExpenses() : Promise.resolve([]),
      tab === "subs" ? getSubscriptionExclusions() : Promise.resolve(new Set<string>()),
      tab === "tracker" ? getBudgetOverrides(yearMonth) : Promise.resolve([]),
      tab === "tracker" ? getBudgetOverrides(nextYm) : Promise.resolve([]),
    ]);

  const subs =
    tab === "subs"
      ? detectSubscriptions(recentForSubs).filter((s) => !exclusions.has(s.key))
      : [];
  const subsTotal = monthlySubscriptionTotal(subs);

  const tracker =
    tab === "tracker"
      ? buildBudgetTracker(
          Object.fromEntries(breakdown.map((b) => [b.category, b.amount])),
          fixedExpensesTotal(fixedItems),
          effectiveVariableTargets(overrides)
        )
      : null;

  return (
    <div className="pb-24">
      <div className="bg-surface px-4 pt-5 pb-3 border-b border-hair-light">
        <div className="flex items-center justify-between">
          <h1 className="text-[18px] font-extrabold tracking-tight">가계부</h1>
          <Suspense fallback={null}>
            <BudgetMonthSelector currentYearMonth={yearMonth} />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={null}>
        <BudgetTabs active={tab} />
      </Suspense>

      {tab === "details" && (
        <Suspense fallback={null}>
          <DetailsTab entries={entries} summary={summary} todayStr={todayStr()} />
        </Suspense>
      )}
      {tab === "tracker" && tracker && (
        <BudgetTrackerTab
          tracker={tracker}
          summary={summary}
          nextYearMonth={nextYm}
          nextOverrides={nextOverrides}
          fixedTotal={fixedExpensesTotal(fixedItems)}
        />
      )}
      {tab === "input" && (
        <Suspense fallback={null}>
          <InputTab />
        </Suspense>
      )}
      {tab === "summary" && (
        <SummaryTab summary={summary} breakdown={breakdown} trend={trend} />
      )}
      {tab === "subs" && (
        <SubscriptionsTab subs={subs} monthlyTotal={subsTotal} summary={summary} />
      )}
      {tab === "fixed" && <FixedTab items={fixedItems} />}
    </div>
  );
}
