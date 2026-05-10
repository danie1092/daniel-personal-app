import {
  syncRoutineItems,
  syncRoutineChecks,
  syncDailyLog,
  syncDailyObservation,
  syncWeeklyObservation,
  syncUserProfile,
} from "../notion/sync.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

// 각 sync는 독립 try/catch — 하나가 죽어도 나머지는 진행. 어떤 게 죽었는지 로그에서 식별 가능.
async function safe<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.error("notionSync stage failed", { stage: name, err: String(err) });
    return null;
  }
}

export async function runNotionSync(): Promise<void> {
  const start = Date.now();
  const items = await safe("routineItems", syncRoutineItems);
  const checks = await safe("routineChecks", syncRoutineChecks);
  const dailyLog = await safe("dailyLog", syncDailyLog);
  const daily = await safe("dailyObservation", syncDailyObservation);
  const weekly = await safe("weeklyObservation", syncWeeklyObservation);
  const profile = await safe("userProfile", syncUserProfile);
  logger.info("notionSync done", {
    durationMs: Date.now() - start,
    items,
    checks,
    dailyLog,
    daily,
    weekly,
    profile,
  });
}
