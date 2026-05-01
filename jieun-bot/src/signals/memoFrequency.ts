import type { SignalCandidate } from "./types.js";

const DROP_THRESHOLD = 0.3;
const SURGE_THRESHOLD = 3.0;

export type MemoRow = { created_at: string };

export function computeMemoFrequency(rows: MemoRow[], now: Date): SignalCandidate | null {
  if (rows.length === 0) return null;
  const sevenAgo = now.getTime() - 7 * 86400 * 1000;
  const fourteenAgo = now.getTime() - 14 * 86400 * 1000;

  let recent = 0;
  let prior = 0;
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (t >= sevenAgo) recent++;
    else if (t >= fourteenAgo) prior++;
  }

  if (prior === 0 && recent === 0) return null;
  if (prior === 0) return null;

  const ratio = recent / prior;
  let direction: "drop" | "surge" | null = null;
  if (ratio < DROP_THRESHOLD) direction = "drop";
  else if (ratio > SURGE_THRESHOLD) direction = "surge";
  if (!direction) return null;

  return {
    kind: "memo_frequency_shift",
    evidence: { recent, prior, ratio: Math.round(ratio * 100) / 100, direction },
    computed_at: now,
  };
}
