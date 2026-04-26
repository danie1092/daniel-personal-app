"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

function shiftMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  let newY = y;
  let newM = m + delta;
  while (newM <= 0) { newM += 12; newY -= 1; }
  while (newM > 12) { newM -= 12; newY += 1; }
  return `${newY}-${String(newM).padStart(2, "0")}`;
}

export function RoutineMonthSelector({ currentYearMonth }: { currentYearMonth: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  function go(yearMonth: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("ym", yearMonth);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const [y, m] = currentYearMonth.split("-").map(Number);

  return (
    <div className="inline-flex items-center gap-1 bg-hair-light rounded-card px-1.5 py-1.5">
      <button
        onClick={() => go(shiftMonth(currentYearMonth, -1))}
        className="px-2 py-1 text-[14px] text-ink-muted hover:text-ink"
        aria-label="이전 달"
      >‹</button>
      <div className="px-2 text-[13px] font-bold tabular-nums">{y}년 {m}월</div>
      <button
        onClick={() => go(shiftMonth(currentYearMonth, 1))}
        className="px-2 py-1 text-[14px] text-ink-muted hover:text-ink"
        aria-label="다음 달"
      >›</button>
    </div>
  );
}
