import cron from "node-cron";
import { runTrigger } from "./router.js";
import { runDailySummary } from "../jobs/dailySummary.js";
import { runWeeklySummary, thisSundayInKst } from "../jobs/weeklySummary.js";
import { runLatentObservation } from "./latent.js";
import type { ClaudeAdapter } from "../claude/adapter.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

export function attachSchedule(claude: ClaudeAdapter): void {
  // 점심 12:30 KST — 끼니 챙김 가벼운 노크
  cron.schedule(
    "30 12 * * *",
    () => {
      runTrigger(claude, {
        trigger: "schedule",
        scheduleKind: "lunch",
        userPrompt:
          "지금은 점심 12:30. 다영이 끼니를 잘 못 챙긴다는 점을 알고 있지. " +
          "점심 챙겼는지 가볍게 물어보고 싶으면 한마디. " +
          "답이 없을 수도 있다는 점 알고 있으니 부담 없이. 침묵해도 OK.",
      }).catch((err) => logger.error("lunch knock failed", { err: String(err) }));
    },
    { timezone: "Asia/Seoul" }
  );

  // 아침 08:00 KST — 가벼운 인사 / 어제 환기
  cron.schedule(
    "0 8 * * *",
    () => {
      runTrigger(claude, {
        trigger: "schedule",
        scheduleKind: "morning",
        userPrompt:
          "지금은 아침 08:00. 다영의 하루 시작 전. " +
          "어제 못 한 거 가볍게 환기하거나 좋은 아침 인사. " +
          "캘린더 데이터는 Block 3에서 추가될 예정 — 지금은 일정 언급 X. " +
          "짧게 한두 문장. 침묵해도 OK.",
      }).catch((err) => logger.error("morning brief failed", { err: String(err) }));
    },
    { timezone: "Asia/Seoul" }
  );

  // 퇴근 직전 20:30 KST — 내일 챙길 거 (Block 3 캘린더 연동 전엔 가벼운 안부)
  cron.schedule(
    "30 20 * * *",
    () => {
      runTrigger(claude, {
        trigger: "schedule",
        scheduleKind: "evening_brief",
        userPrompt:
          "지금은 20:30. 다영의 퇴근 직전. " +
          "캘린더 데이터는 Block 3에서 추가 — 지금은 가벼운 안부. " +
          "침묵 OK.",
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
        userPrompt:
          "지금은 21:00. 다영의 퇴근 시간 즈음. " +
          "'오늘 길었지, 퇴근했어?' 정도 가볍게. 답 없으면 그냥 넘어감. 침묵 OK.",
      }).catch((err) => logger.error("end_of_day check failed", { err: String(err) }));
    },
    { timezone: "Asia/Seoul" }
  );

  // 회고 23:00 KST — 테이블 앞 인사 (회고 본격 모드는 Block 4)
  cron.schedule(
    "0 23 * * *",
    () => {
      runTrigger(claude, {
        trigger: "schedule",
        scheduleKind: "retro",
        userPrompt:
          "지금은 23:00. 다영이 집에 와서 테이블 앞에 앉을 시간. " +
          "가볍게 '테이블 앞이야?' 같은 노크. " +
          "다영이 응하면 본격 회고 (Block 4에서 회고 모드 본격 도입 — 지금은 시작 인사만). " +
          "침묵 OK.",
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

  logger.info("schedule attached", {
    tasks: [
      "morning:08", "lunch:12:30", "evening_brief:20:30", "end_of_day:21",
      "retro:23", "dailySummary:23:30", "latent:10/15/19:30", "weeklySummary:Sun23:59",
    ],
  });
}
