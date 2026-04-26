import type { ItemStreak } from "@/lib/routine/graphData";

type Props = { streaks: ItemStreak[] };

export function StreaksCard({ streaks }: Props) {
  if (streaks.length === 0) return null;

  return (
    <div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
      <h3 className="text-[13px] font-bold mb-3">연속 일수 🔥</h3>
      <div className="flex flex-col gap-1.5">
        {streaks.map((s) => (
          <div key={s.item.id} className="flex items-center gap-2">
            <span className="text-[16px]">{s.item.emoji}</span>
            <span className="flex-1 text-[13px]">{s.item.name}</span>
            <span className={
              s.currentStreak > 0
                ? "text-[13px] font-bold text-success"
                : "text-[13px] text-ink-muted"
            }>
              {s.currentStreak}일
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
