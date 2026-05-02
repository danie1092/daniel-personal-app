"use client";

import type { ProfileEntry } from "@/lib/profileLog/recent";
import { deleteProfileLineAction } from "./actions";

const KIND_LABEL: Record<ProfileEntry["kind"], { ko: string; emoji: string }> = {
  pattern: { ko: "패턴", emoji: "📊" },
  preference: { ko: "취향", emoji: "🎨" },
  tone: { ko: "톤", emoji: "🎵" },
};

export function ProfileLogList({ entries }: { entries: ProfileEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-ink-sub text-[13px]">
        아직 알게 된 게 없어요.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-hair-light">
      {entries.map((e) => {
        const k = KIND_LABEL[e.kind];
        return (
          <li key={e.id} className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-ink-sub mb-1">
                {k.emoji} {k.ko}
              </div>
              <div className="text-[14px] leading-relaxed">{e.observation}</div>
              {e.evidence_dates.length > 0 && (
                <div className="text-[10px] text-ink-sub mt-1">
                  근거: {e.evidence_dates.slice(0, 5).join(", ")}
                  {e.evidence_dates.length > 5 ? ` 외 ${e.evidence_dates.length - 5}일` : ""}
                </div>
              )}
            </div>
            <form action={deleteProfileLineAction.bind(null, e.id)}>
              <button
                type="submit"
                className="text-[12px] text-rose-500 px-3 py-1 rounded-input border border-hair-light"
              >
                삭제
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
