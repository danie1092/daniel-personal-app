export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

const ONE_DAY_MS = 86400 * 1000;
const ONE_YEAR_MS = 365 * ONE_DAY_MS;

export function validateProposeEvent(p: { title: string; start: string; end: string }): ValidationResult {
  if (!p.title || p.title.trim().length === 0) {
    return { ok: false, reason: "title is empty" };
  }
  const startMs = Date.parse(p.start);
  const endMs = Date.parse(p.end);
  if (isNaN(startMs)) return { ok: false, reason: `start ISO malformed: ${p.start}` };
  if (isNaN(endMs)) return { ok: false, reason: `end ISO malformed: ${p.end}` };
  if (endMs <= startMs) {
    return { ok: false, reason: `end (${p.end}) must be after start (${p.start})` };
  }
  const now = Date.now();
  if (startMs < now - ONE_DAY_MS) {
    return { ok: false, reason: `start too far in past: ${p.start}` };
  }
  if (startMs > now + ONE_YEAR_MS) {
    return { ok: false, reason: `start too far in future: ${p.start}` };
  }
  return { ok: true };
}
