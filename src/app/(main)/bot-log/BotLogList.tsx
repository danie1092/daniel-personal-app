"use client";

import type { BotLogEntry } from "@/lib/botLog/recent";
import { deleteBotWriteAction } from "./actions";

export function BotLogList({ entries }: { entries: BotLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-ink-sub text-[13px]">
        아직 봇이 기록한 게 없어요.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-hair-light">
      {entries.map((e) => (
        <li key={e.id} className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            {e.target.kind === "budget_entries" ? (
              <>
                <div className="text-[13px] truncate">
                  {e.target.date} · {e.target.category} · {e.target.memo}
                </div>
                <div className="text-[12px] text-ink-sub">
                  {e.target.amount.toLocaleString()}원 · {e.target.type}
                </div>
              </>
            ) : (
              <div className="text-[13px] text-ink-sub">
                {e.targetTable} (대상 못 찾음)
              </div>
            )}
            <div className="text-[10px] text-ink-sub mt-1">
              {new Date(e.written_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
              {e.user_edited_at && " · 수정됨"}
            </div>
          </div>
          <form action={deleteBotWriteAction.bind(null, e.id)}>
            <button
              type="submit"
              className="text-[12px] text-rose-500 px-3 py-1 rounded-input border border-hair-light"
            >
              삭제
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
