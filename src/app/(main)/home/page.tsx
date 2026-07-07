import { getBudgetSummary } from "@/lib/budget/summary";
import { getSavingsOverview } from "@/lib/budget/savings";
import { getCategoryBreakdown } from "@/lib/budget/monthData";
import { getBudgetOverrides, effectiveVariableTargets } from "@/lib/budget/plans";
import { getCustomCategories, customTargetsFor } from "@/lib/budget/customCategories";
import { budgetMonthOf } from "@/lib/budget/cycle";
import { nowKST } from "@/lib/kst";
import { HomeKPICard } from "./HomeKPICard";
import { HomeSavingsCard } from "./HomeSavingsCard";
import { HomeCategoryCard, type HomeCategoryLine } from "./HomeCategoryCard";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day} ${WEEKDAYS[d.getDay()]}요일`;
}

function getGreeting(d: Date): string {
  const h = d.getHours();
  if (h < 6) return "새벽이네요 🌙";
  if (h < 12) return "좋은 아침이에요 ☀️";
  if (h < 18) return "좋은 오후 🌤";
  return "오늘 하루 어땠어요 🌙";
}

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const today = nowKST();
  const cycle = budgetMonthOf(today);

  const [budget, savings, breakdown, overrides, customs] = await Promise.all([
    getBudgetSummary(),
    getSavingsOverview(),
    getCategoryBreakdown(cycle),
    getBudgetOverrides(cycle),
    getCustomCategories(),
  ]);

  // 카테고리 미니 트래커: 예산 잡힌 변동 카테고리 중 지출 많은 순 상위 4개
  const targets = effectiveVariableTargets(overrides, customTargetsFor(customs, cycle));
  const spentMap = new Map(breakdown.map((b) => [b.category, b.amount]));
  const categoryLines: HomeCategoryLine[] = Object.entries(targets)
    .map(([category, budgetAmount]) => ({
      category,
      spent: spentMap.get(category) ?? 0,
      budget: budgetAmount,
    }))
    .sort((a, b) => b.spent - a.spent || b.budget - a.budget)
    .slice(0, 4);

  const pace = budget.daysInMonth > 0 ? budget.daysIntoMonth / budget.daysInMonth : 0;

  return (
    <div className="px-4 pt-5 pb-32 max-w-md mx-auto">
      <header className="px-2 pb-3">
        <div className="text-[12px] text-ink-sub mb-0.5">{formatDate(today)}</div>
        <h1 className="text-[18px] font-extrabold tracking-tight">{getGreeting(today)}</h1>
      </header>

      <HomeKPICard {...budget} />
      <HomeSavingsCard {...savings} />
      <HomeCategoryCard
        lines={categoryLines}
        pace={pace}
        month={Number(cycle.split("-")[1])}
      />
    </div>
  );
}
