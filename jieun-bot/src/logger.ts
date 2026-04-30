import { mkdirSync, appendFileSync, statSync, renameSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const MAX_BYTES = 100_000;
const MAX_FILES = 5;

export type Level = "info" | "warn" | "error";

export class Logger {
  constructor(private dir: string, private name: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  log(level: Level, msg: string, meta?: Record<string, unknown>): void {
    const line = JSON.stringify({
      t: new Date().toISOString(),
      level,
      msg,
      ...(meta ?? {}),
    }) + "\n";

    const path = join(this.dir, `${this.name}.log`);
    this.rotateIfNeeded(path);
    appendFileSync(path, line, { mode: 0o600 });

    // dev에선 stdout에도
    if (process.env.NODE_ENV !== "production") {
      process.stdout.write(line);
    }
  }

  info(msg: string, meta?: Record<string, unknown>) { this.log("info", msg, meta); }
  warn(msg: string, meta?: Record<string, unknown>) { this.log("warn", msg, meta); }
  error(msg: string, meta?: Record<string, unknown>) { this.log("error", msg, meta); }

  private rotateIfNeeded(path: string): void {
    if (!existsSync(path)) return;
    const size = statSync(path).size;
    if (size < MAX_BYTES) return;

    // path.5 삭제, path.N → path.(N+1), path → path.1
    const oldest = `${path}.${MAX_FILES}`;
    if (existsSync(oldest)) unlinkSync(oldest);
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const src = `${path}.${i}`;
      if (existsSync(src)) renameSync(src, `${path}.${i + 1}`);
    }
    renameSync(path, `${path}.1`);
  }
}
