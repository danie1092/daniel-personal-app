import { syncBudgetEntries } from "../sheets/sync.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

// Supabase PostgrestError나 googleapis GaxiosError는 일반 Error가 아니라
// String(err)이 "[object Object]"가 됨. 메시지/코드 individually 추출.
function errInfo(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const e = err as Error & { code?: string; status?: number; errors?: unknown };
    return {
      message: e.message,
      ...(e.code ? { code: e.code } : {}),
      ...(e.status ? { status: e.status } : {}),
      ...(e.errors ? { errors: e.errors } : {}),
    };
  }
  if (typeof err === "object" && err !== null) {
    const e = err as { message?: string; code?: string; details?: string; hint?: string };
    return {
      message: e.message ?? "(no message)",
      ...(e.code ? { code: e.code } : {}),
      ...(e.details ? { details: e.details } : {}),
      ...(e.hint ? { hint: e.hint } : {}),
    };
  }
  return { raw: String(err) };
}

export async function runSheetsSync(): Promise<void> {
  const start = Date.now();
  try {
    const result = await syncBudgetEntries();
    logger.info("sheetsSync ok", {
      durationMs: Date.now() - start,
      inserted: result.inserted,
      updated: result.updated,
    });
  } catch (err) {
    logger.error("sheetsSync failed", errInfo(err));
  }
}
