import { db } from "../db/client.js";
import { recordBotWrite, markBotWriteEdited } from "../db/botWrites.js";
import type { Action } from "./actions.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";
import {
  setPending,
  getPending,
  clearPending,
} from "../calendar/pending.js";
import { validateProposeEvent } from "../calendar/parse.js";
import { addEvent, deleteEvent } from "../calendar/write.js";
import { sendToOwner } from "../telegram/send.js";

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
 *
 * Calendar pending state is keyed by chatId (per-user), so we require it
 * even if the current 단일-user setup means it's always OWNER.
 */
export async function executeActions(actions: Action[], chatId: number): Promise<void> {
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
      } else if (a.kind === "propose_calendar_event") {
        const v = validateProposeEvent({ title: a.title, start: a.start, end: a.end });
        if (!v.ok) {
          // Claude 환각/잘못된 ISO — graceful: pending 안 박고 다음 액션으로
          logger.warn("propose_calendar_event rejected", { reason: v.reason });
          continue;
        }
        setPending(chatId, { kind: "register", title: a.title, start: a.start, end: a.end });
        logger.info("calendar pending: register", { title: a.title, start: a.start });
      } else if (a.kind === "propose_calendar_delete") {
        setPending(chatId, { kind: "delete", targetUid: a.targetUid, display: a.display });
        logger.info("calendar pending: delete", { targetUid: a.targetUid });
      } else if (a.kind === "confirm_calendar_action") {
        const p = getPending(chatId);
        if (!p) {
          // pending 없는데 confirm — Claude 혼동. 자연어는 이미 다영에게 갔으니 swallow.
          logger.info("confirm without pending — graceful no-op");
          continue;
        }
        if (p.kind === "register") {
          const uid = await addEvent({ title: p.title, start: p.start, end: p.end });
          await recordBotWrite({
            targetTable: "apple_calendar",
            targetId: uid,
            notes: `${p.title} (${p.start} ~ ${p.end})`,
          });
          logger.info("calendar registered", { uid, title: p.title });
        } else {
          await deleteEvent(p.targetUid);
          // 봇이 등록한 calendar row의 bot_writes를 user_edited_at 마킹 — 다영이 의도적 삭제
          const { data } = await db()
            .from("bot_writes")
            .select("id")
            .eq("target_table", "apple_calendar")
            .eq("target_id", p.targetUid)
            .is("user_edited_at", null)
            .limit(1);
          if (data && data[0]) await markBotWriteEdited(data[0].id);
          logger.info("calendar deleted", { uid: p.targetUid });
        }
        clearPending(chatId);
      } else if (a.kind === "cancel_calendar_action") {
        clearPending(chatId);
        logger.info("calendar pending: cancelled");
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

      // confirm_calendar_action 실패 → osascript 권한 등 이슈일 가능성 큼.
      // 다영에게 시스템 메시지로 알림 (다른 액션은 silent fail OK).
      if (a.kind === "confirm_calendar_action") {
        try {
          await sendToOwner(
            "(캘린더 못 건드렸어 — 권한 끊겼나? 시스템 환경설정 → 개인정보보호 → 자동화 한 번 봐줘)",
            "system"
          );
        } catch {
          /* swallow — 알림 실패해도 다음 액션 진행 */
        }
      }
    }
  }
}
