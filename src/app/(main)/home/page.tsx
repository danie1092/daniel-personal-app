import { getBudgetSummary } from "@/lib/budget/summary";
import { getTodayRoutine } from "@/lib/routine/today";
import { getRecentMemos } from "@/lib/memo/recent";
import { HomeKPICard } from "./HomeKPICard";
import { HomeMemoCard } from "./HomeMemoCard";
import { HomeRoutineCard } from "./HomeRoutineCard";

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
  const [budget, routine, memos] = await Promise.all([
    getBudgetSummary(),
    getTodayRoutine(),
    getRecentMemos(3),
  ]);

  const today = new Date();

  return (
    <div className="px-4 pt-5 pb-32 max-w-md mx-auto">
      <header className="px-2 pb-3">
        <div className="text-[12px] text-ink-sub mb-0.5">{formatDate(today)}</div>
        <h1 className="text-[18px] font-extrabold tracking-tight">{getGreeting(today)}</h1>
      </header>

      <HomeKPICard {...budget} />
      <HomeMemoCard memos={memos} />
      <HomeRoutineCard {...routine} />
    </div>
  );
}
