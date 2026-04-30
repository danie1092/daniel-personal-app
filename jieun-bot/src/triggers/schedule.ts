import cron from "node-cron";
import { runTrigger } from "./router.js";
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
        userPrompt:
          "지금은 점심 12:30. 다영이 끼니를 잘 못 챙긴다는 점을 알고 있지. " +
          "점심 챙겼는지 가볍게 물어보고 싶으면 한마디. " +
          "답이 없을 수도 있다는 점 알고 있으니 부담 없이. 침묵해도 OK.",
      }).catch((err) => logger.error("lunch knock failed", { err: String(err) }));
    },
    { timezone: "Asia/Seoul" }
  );

  logger.info("schedule attached", { tasks: ["lunch:12:30"] });
}
