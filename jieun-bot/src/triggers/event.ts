import type { ClaudeAdapter } from "../claude/adapter.js";
import { db } from "../db/client.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

export function attachEvents(_claude: ClaudeAdapter): void {
  db()
    .channel("budget_entries_changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "budget_entries" },
      (payload) => {
        const row = payload.new as { id: string; date: string; category: string; amount: number; type: string };
        logger.info("event: budget_entries INSERT", {
          id: row.id,
          date: row.date,
          category: row.category,
          amount: row.amount,
        });
        // Task 3.8에서 computeSignals → runTrigger(event) 추가
      }
    )
    .subscribe((status) => {
      logger.info("realtime subscribe status", { status });
    });

  logger.info("events attached", { channel: "budget_entries_changes" });
}
