import { z } from "zod";

const BudgetInsertSchema = z.object({
  kind: z.literal("budget_insert"),
  amount: z.number().int().positive(),
  category: z.string().min(1),
  memo: z.string().min(1),
  type: z.enum(["income", "expense", "saving"]),
  date_offset: z.number().int().min(-7).max(0).default(0),
});

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

export const ActionSchema = z.discriminatedUnion("kind", [
  BudgetInsertSchema,
  ProposeCalendarEventSchema,
  ProposeCalendarDeleteSchema,
  ConfirmCalendarActionSchema,
  CancelCalendarActionSchema,
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
    if (!Array.isArray(parsed)) {
      parseError = "actions must be an array";
      continue;
    }
    for (const item of parsed) {
      const r = ActionSchema.safeParse(item);
      if (r.success) actions.push(r.data);
    }
  }
  return { cleanText, actions, ...(parseError ? { parseError } : {}) };
}
