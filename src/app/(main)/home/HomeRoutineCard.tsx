import Link from "next/link";
import type { TodayRoutine } from "@/lib/routine/today";

const MAX_CHIPS = 3;

export function HomeRoutineCard({ total, completed, remaining }: TodayRoutine) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const visible = remaining.slice(0, MAX_CHIPS);
  const overflow = remaining.length - visible.length;

  return (
    <Link
      href="/routine"
      className="block bg-surface rounded-card p-4 mb-3 border border-hair shadow-card active:opacity-80"
    >
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-[14px] font-bold">오늘 루틴</h2>
        <span className="text-[11px] text-ink-sub">더보기 →</span>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-[18px] font-extrabold">
          <span className="text-success">{completed}</span>
          <span className="text-ink-sub"> / {total} 완료</span>
        </div>
        <div className="text-[12px] font-bold text-ink-sub">{pct}%</div>
      </div>

      <div className="h-2 bg-hair-light rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-success rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {remaining.length > 0 ? (
        <>
          <div className="text-[11px] text-ink-sub mb-1.5">남은 항목</div>
          <div className="flex gap-1.5 flex-wrap">
            {visible.map((r) => (
              <span
                key={r.id}
                className="text-[11px] px-2.5 py-1 bg-hair-light text-ink-sub rounded-input font-semibold"
              >
                {r.emoji} {r.name}
              </span>
            ))}
            {overflow > 0 && (
              <span className="text-[11px] px-2.5 py-1 bg-surface border border-dashed border-hair text-ink-muted rounded-input">
                +{overflow}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="text-[11px] text-success font-semibold">오늘 루틴 모두 완료 ✨</div>
      )}
    </Link>
  );
}
