// jieun-bot/src/jobs/weeklySummary.ts
import type { ClaudeAdapter } from "../claude/adapter.js";
import { fetchDailySummariesBetween } from "../db/dailySummary.js";
import { upsertWeeklySummary } from "../db/weeklySummary.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

const SYSTEM_PROMPT = `
이 주의 daily summary 7개를 받아서 한 줄로 요약해.
관찰만, 평가 X. JSON 없이 한 줄 텍스트로 답해.
`.trim();

/**
 * weekStart = 일요일 (이 주의 첫날). 그 주 daily_summary 7개를 모아서 한 줄.
 */
export async function runWeeklySummary(claude: ClaudeAdapter, weekStart: string): Promise<void> {
  // weekStart가 일요일이라는 가정 — 6일 후 == 토요일
  const start = new Date(weekStart);
  const end = new Date(start.getTime() + 6 * 86400 * 1000);
  const endStr = end.toISOString().slice(0, 10);

  const dailies = await fetchDailySummariesBetween(weekStart, endStr);
  if (dailies.length === 0) {
    logger.info("weeklySummary: no dailies, skip", { weekStart });
    return;
  }

  const briefing = dailies.map((d) => `${d.date}: ${d.summary}`).join("\n");

  let text = "";
  try {
    const result = await claude.ask({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `[${weekStart} ~ ${endStr}]\n${briefing}\n\n한 줄로:`,
    });
    text = result.text.trim();
  } catch (err) {
    logger.error("weeklySummary: Claude failed, fallback", { err: String(err) });
    text = `${dailies.length}일 기록.`;
  }

  if (!text) text = `${dailies.length}일 기록.`;
  await upsertWeeklySummary(weekStart, text);
  logger.info("weeklySummary: saved", { weekStart, len: text.length });
}

/**
 * 일요일 자정 직전(23:59) 호출 가정. cron이 매 일요일에만 fire되므로
 * 매번 today=일요일 보장됨. KST date로 'YYYY-MM-DD' 반환.
 */
export function thisSundayInKst(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}
