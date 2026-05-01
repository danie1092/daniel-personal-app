import type { ClaudeAdapter } from "../claude/adapter.js";
import { db } from "../db/client.js";
import { Logger } from "../logger.js";
import { loadEnv } from "../env.js";
import { computeSignals } from "../signals/compute.js";
import { recordCandidate } from "../db/botSignals.js";
import { runTrigger } from "./router.js";
import type { SignalCandidate } from "../signals/types.js";

const logger = new Logger(loadEnv().LOG_DIR, "bot");

function evidenceToContext(candidates: SignalCandidate[]): string {
  const lines: string[] = [];
  for (const c of candidates) {
    if (c.kind === "category_outlier") {
      const e = c.evidence as { category: string; thisWeek: number; weeklyAvg: number; ratio: number };
      lines.push(`- 카테고리 이상치: 이번주 "${e.category}" ${e.thisWeek.toLocaleString()}원 (4주 평균 ${e.weeklyAvg.toLocaleString()}원의 ${e.ratio}배)`);
    } else if (c.kind === "budget_pace") {
      const e = c.evidence as { actual: number; expected: number; ratio: number; dayOfMonth: number; daysInMonth: number };
      lines.push(`- 예산 페이스: 이번달 ${e.dayOfMonth}일째 — 누적 ${e.actual.toLocaleString()}원 (기대 ${e.expected.toLocaleString()}원의 ${e.ratio}배)`);
    } else if (c.kind === "routine_streak_break") {
      const e = c.evidence as { itemName: string; itemEmoji: string; daysSinceCheck: number };
      lines.push(`- 루틴 회피: "${e.itemEmoji} ${e.itemName}" ${e.daysSinceCheck}일째 미체크`);
    } else if (c.kind === "avoidance_recovery") {
      const e = c.evidence as { gapDays: number };
      lines.push(`- 회피→실행 전환: ${e.gapDays}일 미루다 오늘 다시 시작`);
    } else if (c.kind === "memo_frequency_shift") {
      const e = c.evidence as { recent: number; prior: number; ratio: number; direction: string };
      lines.push(`- 메모 빈도 ${e.direction === "drop" ? "급감" : "급증"}: 최근 7일 ${e.recent}개 vs 이전 7일 ${e.prior}개 (${e.ratio}배)`);
    }
  }
  return lines.join("\n");
}

export function attachEvents(claude: ClaudeAdapter): void {
  db()
    .channel("budget_entries_changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "budget_entries" },
      async (payload) => {
        const row = payload.new as { id: string };
        logger.info("event: budget INSERT", { id: row.id });

        try {
          const candidates = await computeSignals();
          if (candidates.length === 0) {
            logger.info("event: no signal candidates");
            return;
          }

          const ids: string[] = [];
          for (const c of candidates) {
            const cid = await recordCandidate({ kind: c.kind, evidence: c.evidence });
            ids.push(cid);
          }

          const contextSection = evidenceToContext(candidates);
          logger.info("event: signal candidates", {
            count: candidates.length,
            kinds: candidates.map((c) => c.kind),
          });

          await runTrigger(claude, {
            trigger: "event",
            userPrompt: `데이터 변화 감지. 아래 시그널을 보고 다영에게 한마디 건넬 만한지 판단. 답이 없을 수도 있으니 부담 없이. 침묵 OK.\n\n${contextSection}`,
            contextSection,
            signalCandidateIds: ids,
          });
        } catch (err) {
          logger.error("event handler failed", { err: String(err) });
        }
      }
    )
    .subscribe((status) => {
      logger.info("realtime subscribe status", { status });
    });

  logger.info("events attached", { channel: "budget_entries_changes" });
}
