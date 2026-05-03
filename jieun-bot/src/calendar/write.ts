import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadEnv } from "../env.js";

const execFileP = promisify(execFile);

const SCRIPT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "scripts");
const ADD_SCRIPT = resolve(SCRIPT_DIR, "calendar-add.applescript");
const DELETE_SCRIPT = resolve(SCRIPT_DIR, "calendar-delete.applescript");

export type AddEventInput = {
  title: string;
  start: string;
  end: string;
};

/**
 * Apple Calendar에 일정 등록. 권한: TCC "자동화 → Calendar.app".
 * KST 기준 시간 분해 후 AppleScript date components로 전달.
 */
export async function addEvent(input: AddEventInput): Promise<string> {
  const env = loadEnv();
  if (!env.JIEUN_CALENDAR_INCLUDE) {
    throw new Error("JIEUN_CALENDAR_INCLUDE is empty — set personal calendar name in .env");
  }

  const startKst = decomposeKst(input.start);
  const durationMin = Math.round(
    (Date.parse(input.end) - Date.parse(input.start)) / 60000
  );
  if (durationMin <= 0) throw new Error(`end must be after start (got ${durationMin}min)`);

  const args = [
    ADD_SCRIPT,
    input.title,
    env.JIEUN_CALENDAR_INCLUDE,
    String(startKst.year),
    String(startKst.month),
    String(startKst.day),
    String(startKst.hour),
    String(startKst.minute),
    String(durationMin),
  ];

  const { stdout } = await execFileP("osascript", args, { timeout: 10_000 });
  const uid = stdout.trim();
  if (!uid) throw new Error("osascript returned empty uid");
  return uid;
}

export async function deleteEvent(uid: string): Promise<void> {
  const env = loadEnv();
  if (!env.JIEUN_CALENDAR_INCLUDE) {
    throw new Error("JIEUN_CALENDAR_INCLUDE is empty");
  }
  await execFileP("osascript", [DELETE_SCRIPT, env.JIEUN_CALENDAR_INCLUDE, uid], { timeout: 10_000 });
}

type KstComponents = { year: number; month: number; day: number; hour: number; minute: number };
function decomposeKst(iso: string): KstComponents {
  const d = new Date(iso);
  if (isNaN(d.getTime())) throw new Error(`invalid ISO: ${iso}`);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
  };
}

export const __test = { decomposeKst };
