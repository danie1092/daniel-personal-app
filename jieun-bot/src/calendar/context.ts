import { fetchEvents, type CalendarEvent } from "./read.js";
import { db } from "../db/client.js";

function kstDate(date: Date, offsetDays: number = 0): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const shifted = new Date(date.getTime() + offsetDays * 86400 * 1000);
  return fmt.format(shifted);
}

async function fetchBotRegisteredUids(sinceDays: number): Promise<Set<string>> {
  const since = new Date(Date.now() - sinceDays * 86400 * 1000).toISOString();
  const { data, error } = await db()
    .from("bot_writes")
    .select("target_id")
    .eq("target_table", "apple_calendar")
    .gte("written_at", since)
    .order("written_at", { ascending: false })
    .limit(50);
  if (error || !data) return new Set();
  return new Set(data.map((r: { target_id: string }) => r.target_id));
}

function formatEvents(label: string, events: CalendarEvent[], botUids: Set<string>): string {
  if (events.length === 0) return "";
  const lines = events.map((e) => {
    const range = `${e.startTime}–${e.endTime}`;
    const tag = botUids.has(e.uid) ? " (봇 등록)" : "";
    return `- ${range} ${e.title}${tag}`;
  });
  return `[${label}]\n${lines.join("\n")}`;
}

export async function briefingForToday(now: Date): Promise<string> {
  const today = kstDate(now);
  const events = await fetchEvents({ from: today, to: today });
  const botUids = await fetchBotRegisteredUids(30);
  return formatEvents("오늘 캘린더", events, botUids);
}

export async function briefingForTomorrow(now: Date): Promise<string> {
  const tomorrow = kstDate(now, 1);
  const events = await fetchEvents({ from: tomorrow, to: tomorrow });
  const botUids = await fetchBotRegisteredUids(30);
  return formatEvents("내일 캘린더", events, botUids);
}

export async function latentSnapshot(now: Date): Promise<string> {
  const today = kstDate(now);
  const yesterday = kstDate(now, -1);
  const events = await fetchEvents({ from: yesterday, to: today });
  const botUids = await fetchBotRegisteredUids(30);
  if (events.length === 0) return "";
  return formatEvents("최근 캘린더 (어제~오늘)", events, botUids);
}
