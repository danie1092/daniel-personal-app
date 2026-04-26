import { createClient } from "@/lib/supabase/server";

export type DiaryEntry = {
  id: string;
  date: string;
  content: string;
  emotion: string | null;
};

export type GrassDay = {
  date: string;
  entry: DiaryEntry | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function monthDates(yearMonth: string): string[] {
  const [y, m] = yearMonth.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${yearMonth}-${pad2(i + 1)}`);
}

export async function getTodayDiary(today: string): Promise<DiaryEntry | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("diary_entries")
    .select("id, date, content, emotion")
    .eq("date", today)
    .maybeSingle();
  return (data as DiaryEntry | null) ?? null;
}

export async function getRecentDiaries(today: string, limit: number = 30): Promise<DiaryEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("diary_entries")
    .select("id, date, content, emotion")
    .lt("date", today)
    .order("date", { ascending: false });
  const list = (data ?? []) as DiaryEntry[];
  return list.slice(0, limit);
}

export async function getMonthGrass(yearMonth: string): Promise<GrassDay[]> {
  const supabase = await createClient();
  const dates = monthDates(yearMonth);
  const start = dates[0];
  const end = dates[dates.length - 1];

  const { data } = await supabase
    .from("diary_entries")
    .select("id, date, content, emotion")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });

  const map = new Map<string, DiaryEntry>();
  for (const e of (data ?? []) as DiaryEntry[]) {
    map.set(e.date, e);
  }
  return dates.map((date) => ({ date, entry: map.get(date) ?? null }));
}
