import { recentConversations, type Conversation } from "../db/conversations.js";

const ROLE_LABEL: Record<Conversation["role"], string> = {
  user: "다영",
  bot: "이지은",
  system: "[system]",
};

/**
 * Format conversations chronologically (oldest first) for prompt memory section.
 * Pure function — no DB access, no slicing.
 */
export function formatRecentConversations(items: Conversation[]): string {
  return items
    .slice()
    .reverse()
    .map((c) => `${ROLE_LABEL[c.role]}: ${c.content}`)
    .join("\n");
}

/**
 * Load the last `hours` of conversations from the DB and return a formatted
 * memory section ready to embed in a Claude system prompt. Block 1: 24h raw only.
 * Block 4 will extend this to splice in daily/weekly summaries beyond 24h.
 */
export async function loadMemorySection(hours: number = 24): Promise<string> {
  const items = await recentConversations(hours);
  // Cap at 30 most-recent for token budget. recentConversations already
  // returns newest-first so we slice the head, then formatRecentConversations
  // reverses to chronological.
  return formatRecentConversations(items.slice(0, 30));
}
