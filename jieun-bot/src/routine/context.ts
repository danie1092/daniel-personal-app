import { db } from "../db/client.js";

export type TimeSlot = "morning" | "afternoon" | "evening";

const SLOT_LABEL: Record<TimeSlot, string> = {
  morning: "아침",
  afternoon: "낮",
  evening: "저녁",
};

type ItemRow = { id: string; name: string; time_slot: string | null; is_active: boolean };
type CheckRow = { item_id: string; checked: boolean };
type DailyLogRow = {
  sleep_score: number | null;
  mood_score: number | null;
  energy_score: number | null;
  breakfast: string | null;
  lunch: string | null;
  dinner: string | null;
};

/**
 * 스케줄 트리거에 주입할 루틴 현황 텍스트.
 * - 시간대 = 'morning' | 'afternoon' | 'evening'
 * - date = YYYY-MM-DD (KST)
 *
 * 출력에는 routine_items.id를 포함 — Claude가 record_routine_check emit 시
 * 정확한 item_id를 박을 수 있어야 함.
 *
 * 데이터가 0건이거나 routine_items가 비어있으면 빈 문자열.
 */
export async function buildRoutineContext(timeSlot: TimeSlot, date: string): Promise<string> {
  const [itemsRes, checksRes] = await Promise.all([
    db()
      .from("routine_items")
      .select("id, name, time_slot, is_active")
      .eq("time_slot", timeSlot)
      .eq("is_active", true),
    db()
      .from("routine_checks")
      .select("item_id, checked")
      .eq("date", date),
  ]);

  const items = (itemsRes.data ?? []) as ItemRow[];
  if (items.length === 0) return "";

  const checked = new Set<string>();
  for (const c of (checksRes.data ?? []) as CheckRow[]) {
    if (c.checked) checked.add(c.item_id);
  }

  const lines = items.map(
    (it) => `- ${it.name} (${checked.has(it.id) ? "체크됨" : "미체크"}) [id=${it.id}]`
  );
  return `[오늘 ${SLOT_LABEL[timeSlot]} 루틴]\n${lines.join("\n")}`;
}

/**
 * 끼니 + 컨디션 현황 텍스트. 12:30 / 23:00 크론에 끼니 미입력 검지용으로 주입.
 */
export async function buildDailyLogContext(date: string): Promise<string> {
  const { data } = await db()
    .from("daily_log")
    .select(
      "sleep_score, mood_score, energy_score, breakfast, lunch, dinner"
    )
    .eq("date", date)
    .maybeSingle();

  const row = (data ?? null) as DailyLogRow | null;
  if (!row) return "[오늘 컨디션/끼니]\n아직 기록 없음";

  const lines: string[] = [];
  const meal = (label: string, v: string | null) =>
    lines.push(`- ${label}: ${v ?? "미입력"}`);
  meal("아침", row.breakfast);
  meal("점심", row.lunch);
  meal("저녁", row.dinner);
  const score = (label: string, v: number | null) =>
    lines.push(`- ${label}: ${v == null ? "미입력" : `${v}점`}`);
  score("수면", row.sleep_score);
  score("기분", row.mood_score);
  score("에너지", row.energy_score);
  return `[오늘 컨디션/끼니]\n${lines.join("\n")}`;
}
