import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { RoutineItem } from "@/lib/routine/today";
import { getTodayRoutine } from "@/lib/routine/today";
import { getMonthGraphData } from "@/lib/routine/graphData";
import { RoutineTabs, type RoutineTab } from "./RoutineTabs";
import { RoutineMonthSelector } from "./RoutineMonthSelector";
import { CheckTab } from "./CheckTab";
import { GraphTab } from "./GraphTab";
import { SettingsTab } from "./SettingsTab";

export const dynamic = "force-dynamic";

const YM_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getAllItems(): Promise<RoutineItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("routine_items")
    .select("id, name, emoji")
    .order("sort_order", { ascending: true });
  return ((data ?? []) as RoutineItem[]);
}

async function getCheckedTodayIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const today = todayStr();
  const { data } = await supabase
    .from("routine_checks")
    .select("item_id")
    .eq("date", today)
    .eq("checked", true);
  return new Set(((data ?? []) as { item_id: string }[]).map((c) => c.item_id));
}

type SearchParams = Promise<{
  tab?: string;
  ym?: string;
}>;

export default async function RoutinePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawTab = params.tab;
  const tab: RoutineTab =
    rawTab === "graph" || rawTab === "settings" ? rawTab : "check";
  const yearMonth = params.ym && YM_REGEX.test(params.ym) ? params.ym : currentYearMonth();

  const today = todayStr();

  if (tab === "check") {
    const [items, routine, checkedIds] = await Promise.all([
      getAllItems(),
      getTodayRoutine(),
      getCheckedTodayIds(),
    ]);

    return (
      <div className="pb-24">
        <Suspense fallback={null}>
          <RoutineTabs active={tab} />
        </Suspense>
        <CheckTab routine={routine} allItems={items} checkedIds={checkedIds} />
      </div>
    );
  }

  if (tab === "graph") {
    const data = await getMonthGraphData(yearMonth);

    return (
      <div className="pb-24">
        <div className="bg-surface px-4 pt-4 pb-2 flex items-center justify-between">
          <h1 className="text-[16px] font-extrabold tracking-tight">루틴</h1>
          <Suspense fallback={null}>
            <RoutineMonthSelector currentYearMonth={yearMonth} />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <RoutineTabs active={tab} />
        </Suspense>
        <GraphTab data={data} todayStr={today} />
      </div>
    );
  }

  // tab === "settings"
  const items = await getAllItems();

  return (
    <div className="pb-24">
      <div className="bg-surface px-4 pt-4 pb-2">
        <h1 className="text-[16px] font-extrabold tracking-tight">루틴 설정</h1>
      </div>
      <Suspense fallback={null}>
        <RoutineTabs active={tab} />
      </Suspense>
      <SettingsTab items={items} />
    </div>
  );
}
