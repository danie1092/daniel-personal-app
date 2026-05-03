import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadEnv } from "../env.js";

const execFileP = promisify(execFile);

export type CalendarEvent = {
  uid: string;
  title: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM (24h)
  endTime: string;    // HH:MM
};

export type FetchRange = {
  from: string;
  to: string;
};

const SEP = "|||";

/**
 * icalBuddy로 개인 캘린더 일정만 가져온다. Google 업무 캘린더 절대 X.
 */
export async function fetchEvents(range: FetchRange): Promise<CalendarEvent[]> {
  const env = loadEnv();
  if (!env.JIEUN_CALENDAR_INCLUDE) {
    throw new Error("JIEUN_CALENDAR_INCLUDE is empty — set personal calendar name in .env");
  }

  const args = [
    "-nc",
    "-nrd",
    "-ea",
    "-b", "",
    "-ic", env.JIEUN_CALENDAR_INCLUDE,
    "-df", "%Y-%m-%d",
    "-tf", "%H:%M",
    "-ps", `${SEP}TITLE${SEP}`,
    "-po", "uid,title,datetime",
    `eventsFrom:${range.from}`,
    `to:${range.to}`,
  ];

  const { stdout } = await execFileP("icalBuddy", args);
  return parseIcalBuddyOutput(stdout);
}

function parseIcalBuddyOutput(stdout: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const fields = line.split(SEP);
    if (fields.length !== 5) continue;
    const [uid, title, date, startTime, endTime] = fields as [string, string, string, string, string];
    if (!uid || !title || !date) continue;
    events.push({ uid, title, date, startTime, endTime });
  }
  return events;
}

export const __test = { parseIcalBuddyOutput };
