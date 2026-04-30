import { bot } from "./telegram/bot.js";
import { attachReceive } from "./telegram/receive.js";
import { sendToOwner } from "./telegram/send.js";
import { Logger } from "./logger.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const logger = new Logger(env.LOG_DIR, "bot");

attachReceive(async (text, _ctx) => {
  // 임시 echo (Task 1.7에서 Claude로 교체)
  await sendToOwner(`(echo) ${text}`, "user");
});

logger.info("jieun-bot starting (echo mode)");
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
