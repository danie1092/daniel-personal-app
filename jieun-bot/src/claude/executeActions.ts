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
            payment_method: "기타",  // 자연어 발화엔 결제수단 정보 없음 — NOT NULL 충족용 기본값
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
      } else if (
        a.kind === "propose_calendar_event" ||
        a.kind === "propose_calendar_delete" ||
        a.kind === "confirm_calendar_action" ||
        a.kind === "cancel_calendar_action"
      ) {
        // TODO Task 3.13 — wire pending Map + AppleScript dispatch here
        logger.info("calendar action received — Task 3.13 will dispatch", { kind: a.kind });
      } else {
        // exhaustive check — ensures TS errors when new Action kinds added without a handler
        const _exhaustive: never = a;
        logger.warn("unknown action kind", { kind: (_exhaustive as { kind: string }).kind });
      }
    } catch (err) {
      // err가 Supabase PostgrestError나 일반 Error일 수 있음 — 메시지/코드 추출
      const errInfo =
        err instanceof Error
          ? { message: err.message }
          : typeof err === "object" && err !== null
          ? { message: (err as { message?: string }).message ?? "(no message)", code: (err as { code?: string }).code, details: (err as { details?: string }).details }
          : { raw: String(err) };
      logger.error("action failed", { kind: a.kind, ...errInfo });
      // 한 액션 실패가 응답 흐름을 막지 않게 swallow
    }
  }
}
