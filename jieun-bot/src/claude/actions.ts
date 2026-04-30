import { z } from "zod";

const BudgetInsertSchema = z.object({
  kind: z.literal("budget_insert"),
  amount: z.number().int().positive(),
  category: z.string().min(1),
  memo: z.string().min(1),
  type: z.enum(["income", "expense", "saving"]),
  date_offset: z.number().int().min(-7).max(0).default(0),
});

export const ActionSchema = z.discriminatedUnion("kind", [BudgetInsertSchema]);
export type Action = z.infer<typeof ActionSchema>;

const ACTIONS_BLOCK_RE = /<actions>\s*([\s\S]*?)\s*<\/actions>/;

export type ParseResult = {
  cleanText: string;       // <actions> 블록 제거된 자연어
  actions: Action[];
  parseError?: string;     // JSON/스키마 실패 시
};

export function parseActions(claudeText: string): ParseResult {
  const match = claudeText.match(ACTIONS_BLOCK_RE);
  if (!match) {
    return { cleanText: claudeText.trim(), actions: [] };
  }

  const cleanText = claudeText.replace(ACTIONS_BLOCK_RE, "").trim();
  const jsonStr = match[1] ?? "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return { cleanText, actions: [], parseError: `JSON parse: ${String(err)}` };
  }

  if (!Array.isArray(parsed)) {
    return { cleanText, actions: [], parseError: "actions must be an array" };
  }

  const actions: Action[] = [];
  for (const item of parsed) {
    const r = ActionSchema.safeParse(item);
    if (r.success) actions.push(r.data);
    // 잘못된 item은 조용히 건너뜀 (one bad apple ≠ all)
  }
  return { cleanText, actions };
}
