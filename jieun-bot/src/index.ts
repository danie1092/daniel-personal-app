import { bot } from "./telegram/bot.js";
import { attachReceive } from "./telegram/receive.js";
import { Logger } from "./logger.js";
import { loadEnv } from "./env.js";
import { AgentSdkClaude } from "./claude/agentSdk.js";
import { runTrigger } from "./triggers/router.js";
import { attachSchedule } from "./triggers/schedule.js";
import { attachEvents } from "./triggers/event.js";
import { muteFor, cancelMute } from "./db/botMute.js";
import { sendToOwner } from "./telegram/send.js";

const env = loadEnv();
const logger = new Logger(env.LOG_DIR, "bot");
const claude = new AgentSdkClaude();

attachReceive(async (text, _ctx) => {
  const trimmed = text.trim();
  if (trimmed === "조용히") {
    await muteFor(24);
    await sendToOwner("응 24시간 조용히 있을게.", "system");
    logger.info("manual mute set", { hours: 24 });
    return;
  }
  if (trimmed === "취소") {
    await cancelMute();
    await sendToOwner("응 풀었어.", "system");
    logger.info("manual mute cleared");
    return;
  }
  await runTrigger(claude, { trigger: "user", userPrompt: text });
});

attachSchedule(claude);
attachEvents(claude);

logger.info("jieun-bot starting");
bot()
  .start({
    onStart: () => logger.info("telegram polling started"),
  })
  .catch((err) => {
    logger.error("bot.start failed", { err: String(err) });
    process.exit(1);
  });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    logger.info(`${sig} — stopping bot`);
    await bot().stop();
    process.exit(0);
  });
}
