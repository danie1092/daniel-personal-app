import { bot } from "./telegram/bot.js";
import { attachReceive } from "./telegram/receive.js";
import { sendToOwner } from "./telegram/send.js";
import { Logger } from "./logger.js";
import { loadEnv } from "./env.js";
import { buildSystemPrompt } from "./persona/prompt.js";
import { AgentSdkClaude } from "./claude/agentSdk.js";
import { recentConversations } from "./db/conversations.js";

const env = loadEnv();
const logger = new Logger(env.LOG_DIR, "bot");
const claude = new AgentSdkClaude();

attachReceive(async (text, _ctx) => {
  // 최근 24시간 대화 → 메모리 섹션
  const recent = await recentConversations(24);
  const memorySection = recent
    .slice(0, 30)
    .reverse()
    .map((c) => `${c.role === "user" ? "다영" : c.role === "bot" ? "이지은" : "[system]"}: ${c.content}`)
    .join("\n");

  const systemPrompt = buildSystemPrompt({
    trigger: "user",
    now: new Date(),
    memorySection,
    profileSection: "",          // Block 4에서 채움
    contextSection: "",          // Block 3에서 채움
  });

  try {
    const result = await claude.ask({ systemPrompt, userPrompt: text });
    if (result.text) {
      await sendToOwner(result.text, "user");
    }
    logger.info("claude responded", { durationMs: result.durationMs, hadText: !!result.text });
  } catch (err) {
    logger.error("claude failed", { err: String(err) });
    await sendToOwner("(이지은이 잠깐 막혔어. `claude login` 확인 부탁해.)", "system");
  }
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
