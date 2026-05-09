import "dotenv/config";
import { z } from "zod";

const Schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_OWNER_CHAT_ID: z.coerce.number().int(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LOG_DIR: z.string().default("./logs"),
  JIEUN_CALENDAR_INCLUDE: z.string().default(""),
  NOTION_TOKEN: z.string().min(1),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1),
  GOOGLE_SHEETS_BUDGET_ID: z.string().min(1),
});

export type Env = z.infer<typeof Schema>;

export function loadEnv(): Env {
  const result = Schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`env load failed: ${issues}`);
  }
  return result.data;
}
