import { Suspense } from "react";
import { getMonthEntries, getMonthSummary, getCategoryBreakdown } from "@/lib/budget/monthData";
import { BudgetMonthSelector } from "./BudgetMonthSelector";
import { BudgetTabs, type BudgetTab } from "./BudgetTabs";
import { DetailsTab } from "./DetailsTab";
import { InputTab } from "./InputTab";
import { SummaryTab } from "./SummaryTab";
import { SubscriptionsTab } from "./SubscriptionsTab";
import {
  getRecentEntries,
  detectSubscriptions,
  monthlySubscriptionTotal,
} from "@/lib/budget/subscriptions";

export const dynamic = "force-dynamic";

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
    rawTab === "input" || rawTab === "summary" || rawTab === "subs" ? rawTab : "details";

  const needsMonthEntries = tab === "details";
  const [entries, summary, breakdown, recentForSubs] = await Promise.all([
    needsMonthEntries ? getMonthEntries(yearMonth) : Promise.resolve([]),
    getMonthSummary(yearMonth),
    tab === "summary" ? getCategoryBreakdown(yearMonth) : Promise.resolve([]),
    tab === "subs" ? getRecentEntries(4) : Promise.resolve([]),
  ]);

  const subs = tab === "subs" ? detectSubscriptions(recentForSubs) : [];
  const subsTotal = monthlySubscriptionTotal(subs);

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
      {tab === "input" && (
        <Suspense fallback={null}>
          <InputTab />
        </Suspense>
      )}
      {tab === "summary" && (
        <SummaryTab summary={summary} breakdown={breakdown} />
      )}
      {tab === "subs" && (
        <SubscriptionsTab subs={subs} monthlyTotal={subsTotal} summary={summary} />
      )}
    </div>
  );
}
