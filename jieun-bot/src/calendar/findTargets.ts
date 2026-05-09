import { db } from "../db/client.js";

export type DeletionCandidate = {
  targetUid: string;
  display: string;
  writtenAt: string;
};

const MAX_CANDIDATES = 5;

/**
 * 봇이 등록한 + 아직 다영이 안 지운 (또는 봇이 안 지운) 일정 목록.
 * 최근 14일 안 + user_edited_at IS NULL.
 */
export async function findDeletionCandidates(): Promise<DeletionCandidate[]> {
  const since = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
  const { data, error } = await db()
    .from("bot_writes")
    .select("id, target_id, written_at, notes")
    .eq("target_table", "apple_calendar")
    .is("user_edited_at", null)
    .gte("written_at", since)
    .order("written_at", { ascending: false })
    .limit(MAX_CANDIDATES);
  if (error) throw error;
  return (data ?? []).map((r: { target_id: string; notes: string | null; written_at: string }) => ({
    targetUid: r.target_id,
    display: r.notes ?? "(메모 없음)",
    writtenAt: r.written_at,
  }));
}
