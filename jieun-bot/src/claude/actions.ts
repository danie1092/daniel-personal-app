import { z } from "zod";

const ProposeCalendarEventSchema = z.object({
  kind: z.literal("propose_calendar_event"),
  title: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
});

const ProposeCalendarDeleteSchema = z.object({
  kind: z.literal("propose_calendar_delete"),
  targetUid: z.string().min(1),
  display: z.string().min(1),
});

const ConfirmCalendarActionSchema = z.object({
  kind: z.literal("confirm_calendar_action"),
});

const CancelCalendarActionSchema = z.object({
  kind: z.literal("cancel_calendar_action"),
});

const RecordRoutineCheckSchema = z.object({
  kind: z.literal("record_routine_check"),
  item_id: z.string().min(1),
  checked: z.boolean(),
  date: z.string().min(1),
});

const RecordConditionSchema = z.object({
  kind: z.literal("record_condition"),
  date: z.string().min(1),
  sleep_score: z.number().int().min(1).max(5).optional(),
  sleep_text: z.string().optional(),
  mood_score: z.number().int().min(1).max(5).optional(),
  mood_text: z.string().optional(),
  energy_score: z.number().int().min(1).max(5).optional(),
  energy_text: z.string().optional(),
});

const RecordMealSchema = z.object({
  kind: z.literal("record_meal"),
  date: z.string().min(1),
  breakfast: z.string().optional(),
  lunch: z.string().optional(),
  dinner: z.string().optional(),
});

const ProposeRoutineChangeSchema = z.object({
  kind: z.literal("propose_routine_change"),
  change: z.enum(["add", "remove"]),
  name: z.string().min(1),
  time_slot: z.string().min(1),
  reason: z.string().min(1),
});

const ConfirmRoutineChangeSchema = z.object({
  kind: z.literal("confirm_routine_change"),
});

const CancelRoutineChangeSchema = z.object({
  kind: z.literal("cancel_routine_change"),
});

export const ActionSchema = z.discriminatedUnion("kind", [
  ProposeCalendarEventSchema,
  ProposeCalendarDeleteSchema,
  ConfirmCalendarActionSchema,
  CancelCalendarActionSchema,
  RecordRoutineCheckSchema,
  RecordConditionSchema,
  RecordMealSchema,
  ProposeRoutineChangeSchema,
  ConfirmRoutineChangeSchema,
  CancelRoutineChangeSchema,
]);
export type Action = z.infer<typeof ActionSchema>;

export type ParseResult = {
  cleanText: string;       // <actions> 블록 제거된 자연어
  actions: Action[];
  parseError?: string;     // JSON/스키마 실패 시
};

export function parseActions(claudeText: string): ParseResult {
  // Match ALL <actions> blocks (global flag for multi-occurrence)
  const re = /<actions>\s*([\s\S]*?)\s*<\/actions>/g;
  const matches = [...claudeText.matchAll(re)];

  if (matches.length === 0) {
    return { cleanText: claudeText.trim(), actions: [] };
  }

  // Strip all blocks from the visible text
  const cleanText = claudeText.replace(re, "").trim();

  // Parse each block and accumulate
  const actions: Action[] = [];
  let parseError: string | undefined;
  for (const m of matches) {
    const jsonStr = m[1] ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err) {
      parseError = `JSON parse: ${String(err)}`;
      continue;
    }
    // Claude는 "단일 액션 한 번 emit"하는 케이스에서 array wrap을 자주 누락
    // ({"kind":"..."} 형태). 룰을 array로 강제하면 1-액션 케이스에서 fragile —
    // 둘 다 받기.
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      const r = ActionSchema.safeParse(item);
      if (r.success) actions.push(r.data);
    }
  }
  return { cleanText, actions, ...(parseError ? { parseError } : {}) };
}
