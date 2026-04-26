import Link from "next/link";
import type { RoutineItem, TodayRoutine } from "@/lib/routine/today";
import { CheckRow } from "./CheckRow";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function formatDate(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${WEEKDAYS[d.getDay()]}요일`;
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Props = {
  routine: TodayRoutine;
  allItems: RoutineItem[];
  checkedIds: Set<string>;
};

export function CheckTab({ allItems, checkedIds }: Props) {
  const today = new Date();
  const todayStr = localDateStr(today);
  const total = allItems.length;
  const completed = allItems.filter((i) => checkedIds.has(i.id)).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = total > 0 && completed === total;

  return (
    <div>
      {/* 헤더 */}
      <div className="bg-surface px-4 pt-5 pb-4 border-b border-hair-light flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-extrabold tracking-tight leading-none">루틴</h1>
          <p className="text-[11px] text-ink-muted mt-1">{formatDate(today)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-11 h-11">
            <svg className="w-11 h-11 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="#F2F4F6" strokeWidth="4" />
              <circle cx="18" cy="18" r="14" fill="none" stroke="#22C55E" strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 14}`}
                strokeDashoffset={`${2 * Math.PI * 14 * (1 - pct / 100)}`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
              {pct}%
            </span>
          </div>
          <span className="text-[11px] text-ink-muted">{completed}/{total}</span>
        </div>
      </div>

      {/* 항목 리스트 */}
      {total === 0 ? (
        <div className="text-center py-16 px-4">
          <p className="text-[13px] text-ink-muted mb-2">루틴 항목이 없어요</p>
          <Link
            href="/routine?tab=settings"
            className="text-[12px] text-primary font-semibold underline"
          >설정에서 추가하기</Link>
        </div>
      ) : (
        <div className="bg-surface">
          {allItems.map((item, i) => (
            <CheckRow
              key={item.id}
              itemId={item.id}
              name={item.name}
              emoji={item.emoji}
              date={todayStr}
              initialChecked={checkedIds.has(item.id)}
              isLast={i === allItems.length - 1}
            />
          ))}
          {allDone && (
            <div className="text-center py-6">
              <p className="text-[13px] text-success font-semibold">오늘 루틴 완료! 🎉</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
