import { bot } from "./telegram/bot.js";
import { attachReceive } from "./telegram/receive.js";
import { Logger } from "./logger.js";
import { loadEnv } from "./env.js";
import { AgentSdkClaude } from "./claude/agentSdk.js";
import { runTrigger } from "./triggers/router.js";

const env = loadEnv();
const logger = new Logger(env.LOG_DIR, "bot");
const claude = new AgentSdkClaude();

attachReceive(async (text, _ctx) => {
  await runTrigger(claude, { trigger: "user", userPrompt: text });
});

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
