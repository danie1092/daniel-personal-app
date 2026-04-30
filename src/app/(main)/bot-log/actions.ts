"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/serviceServer";
import { revalidatePath } from "next/cache";

/**
 * Delete a bot-recorded entry. Removes the target row from its source table
 * AND marks the bot_writes row as user_edited_at (audit trail preserved —
 * 다영이 수정한 사실은 남기고, 데이터만 삭제).
 *
 * - Read bot_writes + DELETE target row: authenticated client (RLS allows).
 * - UPDATE bot_writes.user_edited_at: service-role client (RLS doesn't grant
 *   UPDATE to authenticated for bot_writes — by design, audit-only).
 */
export async function deleteBotWriteAction(id: string): Promise<void> {
  const supabase = await createClient();

  const { data: write, error: getErr } = await supabase
    .from("bot_writes")
    .select("target_table, target_id")
    .eq("id", id)
    .single();
  if (getErr) throw getErr;
  if (!write) return;

  // 1. 대상 row 삭제 (authenticated가 가능한 테이블)
  const { error: tErr } = await supabase
    .from(write.target_table)
    .delete()
    .eq("id", write.target_id);
  if (tErr) throw tErr;

  // 2. bot_writes의 user_edited_at 마킹 — service_role 필요
  const service = createServiceClient();
  const { error: bErr } = await service
    .from("bot_writes")
    .update({ user_edited_at: new Date().toISOString() })
    .eq("id", id);
  if (bErr) throw bErr;

  revalidatePath("/bot-log");
}
