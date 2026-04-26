import { createClient } from "@/lib/supabase/server";

export type RoutineItem = { id: string; name: string; emoji: string };

export type TodayRoutine = {
  total: number;
  completed: number;
  remaining: RoutineItem[];
};

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getTodayRoutine(): Promise<TodayRoutine> {
  const supabase = await createClient();
  const todayStr = localDateStr(new Date());

  const [itemsRes, checksRes] = await Promise.all([
    supabase.from("routine_items").select("id, name, emoji").order("sort_order", { ascending: true }),
    supabase
      .from("routine_checks")
      .select("item_id, checked")
      .eq("date", todayStr)
      .eq("checked", true),
  ]);

  const items = ((itemsRes as { data: RoutineItem[] | null }).data ?? []) as RoutineItem[];
  const checks = ((checksRes as { data: { item_id: string }[] | null }).data ?? []);
  const checkedSet = new Set(checks.map((c) => c.item_id));

  return {
    total: items.length,
    completed: items.filter((i) => checkedSet.has(i.id)).length,
    remaining: items.filter((i) => !checkedSet.has(i.id)),
  };
}
