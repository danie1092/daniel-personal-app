export type SignalKind =
  | "category_outlier"
  | "budget_pace"
  | "routine_streak_break"
  | "avoidance_recovery"
  | "memo_frequency_shift";

export type SignalCandidate = {
  kind: SignalKind;
  evidence: Record<string, unknown>;
  computed_at: Date;
};
