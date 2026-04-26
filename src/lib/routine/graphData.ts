import { createClient } from "@/lib/supabase/server";
import type { RoutineItem } from "./today";

export type DayCell = { date: string; checked: boolean };
export type ItemRow = { item: RoutineItem; cells: DayCell[]; total: number };
export type DayTotal = { date: string; done: number; total: number; pct: number };
export type ItemStreak = { item: RoutineItem; currentStreak: number };

export type MonthGraphData = {
  yearMonth: string;
  items: RoutineItem[];
  rows: ItemRow[];
  dayTotals: DayTotal[];
  streaks: ItemStreak[];
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function daysInMonth(year: number, monthOneBased: number): number {
  return new Date(year, monthOneBased, 0).getDate();
}

function monthDates(yearMonth: string): string[] {
  const [y, m] = yearMonth.split("-").map(Number);
  const last = daysInMonth(y, m);
  return Array.from({ length: last }, (_, i) => `${yearMonth}-${pad2(i + 1)}`);
}

export async function getMonthGraphData(yearMonth: string): Promise<MonthGraphData> {
  const supabase = await createClient();
  const dates = monthDates(yearMonth);
  const start = dates[0];
  const end = dates[dates.length - 1];

  const itemsRes = await supabase
    .from("routine_items")
    .select("id, name, emoji")
    .order("sort_order", { ascending: true });

  const checksRes = await supabase
    .from("routine_checks")
    .select("item_id, date, checked")
    .gte("date", start)
    .lte("date", end)
    .eq("checked", true);

  const items = ((itemsRes as { data: RoutineItem[] | null }).data ?? []) as RoutineItem[];
  const checks = ((checksRes as { data: { item_id: string; date: string }[] | null }).data ?? []);

  // checked map: item_id × date
  const checkedMap = new Map<string, Set<string>>();
  for (const c of checks) {
    if (!checkedMap.has(c.item_id)) checkedMap.set(c.item_id, new Set());
    checkedMap.get(c.item_id)!.add(c.date);
  }

  // rows
  const rows: ItemRow[] = items.map((item) => {
    const set = checkedMap.get(item.id) ?? new Set();
    const cells: DayCell[] = dates.map((date) => ({ date, checked: set.has(date) }));
    const total = cells.filter((c) => c.checked).length;
    return { item, cells, total };
  });

  // dayTotals
  const dayTotals: DayTotal[] = dates.map((date) => {
    let done = 0;
    for (const item of items) {
      if (checkedMap.get(item.id)?.has(date)) done += 1;
    }
    const total = items.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { date, done, total, pct };
  });

  // Streak: 오늘부터 거꾸로 연속 체크 일수 (오늘 미체크면 0)
  const todayStr = localDateStr(new Date());
  const streaks: ItemStreak[] = items.map((item) => {
    const set = checkedMap.get(item.id) ?? new Set();
    let streak = 0;
    const cur = new Date(todayStr + "T00:00:00");
    for (;;) {
      const ds = localDateStr(cur);
      if (!set.has(ds)) break;
      streak += 1;
      cur.setDate(cur.getDate() - 1);
    }
    return { item, currentStreak: streak };
  });
  streaks.sort((a, b) => b.currentStreak - a.currentStreak);

  return {
    yearMonth,
    items,
    rows,
    dayTotals,
    streaks,
  };
}
