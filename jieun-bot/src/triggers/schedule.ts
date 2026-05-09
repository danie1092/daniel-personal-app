import cron from "node-cron";
import { runTrigger } from "./router.js";
import { runDailySummary } from "../jobs/dailySummary.js";
import { runWeeklySummary, thisSundayInKst } from "../jobs/weeklySummary.js";
import { runLatentObservation } from "./latent.js";
import type { ClaudeAdapter } from "../claude/adapter.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";
import { ownerChatId } from "../telegram/bot.js";
import { briefingForToday, briefingForTomorrow } from "../calendar/context.js";
import { runNotionSync } from "../jobs/notionSync.js";
import { runSheetsSync } from "../jobs/sheetsSync.js";
import { buildRoutineContext, buildDailyLogContext } from "../routine/context.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

function ymdKstToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function safeRoutine(slot: "morning" | "afternoon" | "evening", date: string): Promise<string> {
  try {
    return await buildRoutineContext(slot, date);
  } catch (err) {
    logger.warn("routine context failed", { slot, err: String(err) });
    return "";
  }
}

async function safeDailyLog(date: string): Promise<string> {
  try {
    return await buildDailyLogContext(date);
  } catch (err) {
    logger.warn("daily log context failed", { err: String(err) });
    return "";
  }
}

export function attachSchedule(claude: ClaudeAdapter): void {
  // 점심 12:30 KST — 낮 루틴 + 끼니 현황 + 가벼운 노크
  cron.schedule(
    "30 12 * * *",
    async () => {
      const date = ymdKstToday();
      const [routine, daily] = await Promise.all([
        safeRoutine("afternoon", date),
        safeDailyLog(date),
      ]);
      const contextSection = [routine, daily].filter(Boolean).join("\n\n");
      runTrigger(claude, {
        trigger: "schedule",
        scheduleKind: "lunch",
        chatId: ownerChatId(),
        contextSection,
        userPrompt:
          "지금은 점심 12:30. 다영이 끼니를 잘 못 챙긴다는 점을 알고 있지. " +
          "[현재 컨텍스트]에 낮 루틴/끼니 현황이 있으면 그걸 보고 *맥락 있는 한마디*. " +
          "끼니 미입력이면 자연스럽게 한 번 물어. 답이 없을 수도 있어, 부담 없이. 침묵 OK.",
      }).catch((err) => logger.error("lunch knock failed", { err: String(err) }));
    },
    { timezone: "Asia/Seoul" }
  );

  // 아침 08:00 KST — 오늘 캘린더 + 아침 루틴 현황 + 가벼운 인사
  cron.schedule(
    "0 8 * * *",
    async () => {
      const date = ymdKstToday();
      let calendarSection = "";
      try {
        calendarSection = await briefingForToday(new Date());
      } catch (err) {
        logger.warn("calendar briefing failed (morning)", { err: String(err) });
      }
      const routine = await safeRoutine("morning", date);
      const contextSection = [calendarSection, routine].filter(Boolean).join("\n\n");
      runTrigger(claude, {
        trigger: "schedule",
        scheduleKind: "morning",
        chatId: ownerChatId(),
        contextSection,
        userPrompt:
          "지금은 아침 08:00. 다영의 하루 시작 전. " +
          "[현재 컨텍스트]에 캘린더가 있으면 *맥락 있는 한마디*. " +
          "아침 루틴 목록도 박혀 있어 — *가장 위 미체크 1개만* 골라 자연스럽게 유도 (예: '물 한 잔 했어?'). 절대 목록 나열 X, 1개만. " +
          "일정·루틴 다 비면 가벼운 인사. 짧게. 침묵 OK.",
      }).catch((err) => logger.error("morning brief failed", { err: String(err) }));
    },
    { timezone: "Asia/Seoul" }
  );

  // 퇴근 직전 20:30 KST — 내일 캘린더 미리 짚기
  cron.schedule(
    "30 20 * * *",
    async () => {
      let calendarSection = "";
      try {
        calendarSection = await briefingForTomorrow(new Date());
      } catch (err) {
        logger.warn("calendar briefing failed (evening)", { err: String(err) });
      }
      runTrigger(claude, {
        trigger: "schedule",
        scheduleKind: "evening_brief",
        chatId: ownerChatId(),
        contextSection: calendarSection,
        userPrompt:
          "지금은 20:30. 다영의 퇴근 직전. " +
          "[현재 컨텍스트]에 내일 캘린더가 있으면 가볍게 짚어 (예: '내일 1시 회의 있네'). " +
          "없으면 가벼운 안부. 침묵 OK.",
      }).catch((err) => logger.error("evening brief failed", { err: String(err) }));
    },
    { timezone: "Asia/Seoul" }
  );

  // 퇴근 시간 21:00 KST — 퇴근 체크
  cron.schedule(
    "0 21 * * *",
    () => {
      runTrigger(claude, {
        trigger: "schedule",
        scheduleKind: "end_of_day",
        chatId: ownerChatId(),
        userPrompt:
          "지금은 21:00. 다영의 퇴근 시간 즈음. " +
          "'오늘 길었지, 퇴근했어?' 정도 가볍게. 답 없으면 그냥 넘어감. 침묵 OK.",
      }).catch((err) => logger.error("end_of_day check failed", { err: String(err) }));
    },
    { timezone: "Asia/Seoul" }
  );

  // 회고 23:00 KST — 저녁 루틴 + 컨디션 현황 박고 가볍게 노크
  cron.schedule(
    "0 23 * * *",
    async () => {
      const date = ymdKstToday();
      const [routine, daily] = await Promise.all([
        safeRoutine("evening", date),
        safeDailyLog(date),
      ]);
      const contextSection = [routine, daily].filter(Boolean).join("\n\n");
      runTrigger(claude, {
        trigger: "schedule",
        scheduleKind: "retro",
        chatId: ownerChatId(),
        contextSection,
        userPrompt:
          "지금은 23:00. 다영이 집에 와서 테이블 앞에 앉을 시간. " +
          "[현재 컨텍스트]에 저녁 루틴/오늘 컨디션 현황이 있어. " +
          "가볍게 '테이블 앞이야?' 류 노크 + 컨디션 미입력 분명하면 한 가지만 자연스럽게 (예: '오늘 잠은 어땠어?'). " +
          "다영이 응하면 회고. 침묵 OK.",
      }).catch((err) => logger.error("evening retro failed", { err: String(err) }));
    },
    { timezone: "Asia/Seoul" }
  );

  // 일일 요약 23:30 — 회고 마무리 후 그날 정리. user_profile 누적도 같은 잡.
  cron.schedule(
    "30 23 * * *",
    () => {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()); // 'YYYY-MM-DD'
      runDailySummary(claude, today).catch((err) =>
        logger.error("dailySummary job failed", { err: String(err) })
      );
    },
    { timezone: "Asia/Seoul" }
  );

  // 잠재 관찰 — 활성 시간대 3 슬롯 (10:00 / 15:00 / 19:30)
  for (const [hour, min, label] of [
    [10, 0, "10:00"],
    [15, 0, "15:00"],
    [19, 30, "19:30"],
  ] as const) {
    cron.schedule(
      `${min} ${hour} * * *`,
      () => {
        runLatentObservation(claude).catch((err) =>
          logger.error("latent observation failed", { slot: label, err: String(err) })
        );
      },
      { timezone: "Asia/Seoul" }
    );
  }

  // 주간 요약 — 일요일 23:59 (cron weekday 0=Sunday)
  cron.schedule(
    "59 23 * * 0",
    () => {
      const today = thisSundayInKst();
      runWeeklySummary(claude, today).catch((err) =>
        logger.error("weeklySummary job failed", { err: String(err) })
      );
    },
    { timezone: "Asia/Seoul" }
  );

  // 노션 sync — 30분마다 (DB → 노션 push, routine_items는 노션 → DB)
  cron.schedule(
    "*/30 * * * *",
    () => {
      runNotionSync().catch((err) =>
        logger.error("notionSync schedule failed", { err: String(err) })
      );
    },
    { timezone: "Asia/Seoul" }
  );

  // Google Sheets sync — 30분마다, 노션과 15분 stagger (budget_entries → 다니의 가계부)
  cron.schedule(
    "15,45 * * * *",
    () => {
      runSheetsSync().catch((err) =>
        logger.error("sheetsSync schedule failed", { err: String(err) })
      );
    },
    { timezone: "Asia/Seoul" }
  );

  logger.info("schedule attached", {
    tasks: [
      "morning:08", "lunch:12:30", "evening_brief:20:30", "end_of_day:21",
      "retro:23", "dailySummary:23:30", "latent:10/15/19:30", "weeklySummary:Sun23:59",
      "notionSync:*/30", "sheetsSync:15,45",
    ],
  });
}
