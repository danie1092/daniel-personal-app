// jieun-bot/src/memory/load.ts
import { recentConversations, type Conversation } from "../db/conversations.js";
import { fetchDailySummariesBetween, type DailySummary } from "../db/dailySummary.js";
import { fetchWeeklySummariesBetween, type WeeklySummary } from "../db/weeklySummary.js";
import { fetchActiveProfile } from "../db/userProfile.js";

const ROLE_LABEL: Record<Conversation["role"], string> = {
  user: "다영",
  bot: "이지은",
  system: "[system]",
};

const DAILY_CAP = 30;
const WEEKLY_CAP = 12; // 3개월 한도
const RECENT_RAW_CAP = 30;

export function formatRecentConversations(items: Conversation[]): string {
  return items
    .slice()
    .reverse()
    .map((c) => `${ROLE_LABEL[c.role]}: ${c.content}`)
    .join("\n");
}

function formatMd(date: string): string {
  // "2026-04-29" -> "4/29"
  const [, mm, dd] = date.split("-");
  return `${parseInt(mm, 10)}/${parseInt(dd, 10)}`;
}

export function formatDailySummaries(items: DailySummary[]): string {
  if (items.length === 0) return "";
  return items.map((i) => `- ${formatMd(i.date)}: ${i.summary}`).join("\n");
}

export function formatWeeklySummaries(items: WeeklySummary[]): string {
  if (items.length === 0) return "";
  return items
    .map((i) => {
      const start = new Date(i.week_start);
      const end = new Date(start.getTime() + 6 * 86400 * 1000);
      const endStr = `${end.getUTCMonth() + 1}/${end.getUTCDate()}`;
      return `- ${formatMd(i.week_start)}~${endStr}: ${i.summary}`;
    })
    .join("\n");
}

function todayIsoDate(d: Date = new Date()): string {
  const t = new Date(d.getTime() + 9 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}

function dateMinus(days: number, base: Date = new Date()): string {
  return todayIsoDate(new Date(base.getTime() - days * 86400 * 1000));
}

/**
 * Block 4 메모리 = 24h raw + 24h~30d daily summaries + 30d~ weekly summaries
 * (가장 최근 30일에 걸치는 주는 weekly에서 제외 — daily와 중복 방지).
 */
export async function loadMemorySection(hoursRecent: number = 24): Promise<string> {
  const items = await recentConversations(hoursRecent);
  const recent = formatRecentConversations(items.slice(0, RECENT_RAW_CAP));

  const thirtyAgo = dateMinus(30);
  const yesterday = dateMinus(1);

  const dailies = await fetchDailySummariesBetween(thirtyAgo, yesterday);
  const cappedDailies = dailies.slice(-DAILY_CAP);

  // 30일 이전 시작한 주만
  const weeklies = await fetchWeeklySummariesBetween(dateMinus(180), thirtyAgo);
  const cappedWeeklies = weeklies.filter((w) => w.week_start < thirtyAgo).slice(-WEEKLY_CAP);

  const blocks: string[] = [];
  if (recent) blocks.push(`지난 ${hoursRecent}h:\n${recent}`);
  if (cappedDailies.length > 0) blocks.push(`지난 30일 요약:\n${formatDailySummaries(cappedDailies)}`);
  if (cappedWeeklies.length > 0) blocks.push(`더 이전 (주간 요약):\n${formatWeeklySummaries(cappedWeeklies)}`);

  return blocks.join("\n\n");
}

/**
 * 활성 user_profile 최근 N개를 한 블럭 텍스트로. inline `(kind)` prefix.
 * 빈 set이면 빈 문자열 — 호출처가 prompt 섹션 통째로 생략하도록.
 */
export async function getProfileSection(limit: number = 30): Promise<string> {
  const rows = await fetchActiveProfile(limit);
  if (rows.length === 0) return "";
  // 시각상 오래된 게 위, 최근이 아래 (정착된 관찰 → 최근 관찰)
  return rows
    .slice()
    .reverse()
    .map((r) => `- (${r.kind}) ${r.observation}`)
    .join("\n");
}
