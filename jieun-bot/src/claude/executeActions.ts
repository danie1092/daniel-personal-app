import { db } from "../db/client.js";
import { recordBotWrite } from "../db/botWrites.js";
import type { Action } from "./actions.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

function dateForOffset(offset: number): string {
  // KST 기준 오늘 + offset일. host TZ 무관.
  const now = new Date();
  const offsetMs = offset * 86400 * 1000;
  const target = new Date(now.getTime() + offsetMs);

  // en-CA + Asia/Seoul yields YYYY-MM-DD format directly
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(target);
}

/**
 * Run the actions emitted by Claude. One failure does not abort others.
 * Each successful insert is logged to bot_writes for audit + /bot-log review.
 */
export async function executeActions(actions: Action[]): Promise<void> {
  for (const a of actions) {
    try {
      if (a.kind === "budget_insert") {
        const date = dateForOffset(a.date_offset);
        const { data, error } = await db()
          .from("budget_entries")
          .insert({
            date,
            category: a.category,
            memo: a.memo,
            amount: a.amount,
            type: a.type,
          })
          .select("id")
          .single();
        if (error) throw error;
        await recordBotWrite({
          targetTable: "budget_entries",
          targetId: data.id,
          notes: `${a.memo} ${a.amount.toLocaleString()}원 (${a.category}, ${a.type}, ${date})`,
        });
        logger.info("action: budget_insert", { id: data.id, amount: a.amount, category: a.category });
      } else {
        // exhaustive check — ensures TS errors when new Action kinds added without a handler
        const _exhaustive: never = a.kind;
        logger.warn("unknown action kind", { kind: (a as { kind: string }).kind });
      }
    } catch (err) {
      logger.error("action failed", { kind: a.kind, err: String(err) });
      // 한 액션 실패가 응답 흐름을 막지 않게 swallow
    }
  }
}
