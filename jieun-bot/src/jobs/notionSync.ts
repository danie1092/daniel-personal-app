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

export async function runNotionSync(): Promise<void> {
  const start = Date.now();
  try {
    const items = await syncRoutineItems();
    const checks = await syncRoutineChecks();
    const dailyLog = await syncDailyLog();
    const daily = await syncDailyObservation();
    const weekly = await syncWeeklyObservation();
    const profile = await syncUserProfile();
    logger.info("notionSync ok", {
      durationMs: Date.now() - start,
      items,
      checks,
      dailyLog,
      daily,
      weekly,
      profile,
    });
  } catch (err) {
    logger.error("notionSync failed", { err: String(err) });
  }
}
