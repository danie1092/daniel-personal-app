import type { ItemRow, DayTotal } from "@/lib/routine/graphData";

type Props = {
  rows: ItemRow[];
  dayTotals: DayTotal[];
  todayStr: string;
};

export function HabitGrid({ rows, dayTotals, todayStr }: Props) {
  if (rows.length === 0) {
    return (
      <div className="bg-surface rounded-card p-6 mb-3 border border-hair shadow-card text-center">
        <p className="text-[13px] text-ink-muted">루틴 항목이 없어요</p>
      </div>
    );
  }

  const days = dayTotals.map((d) => parseInt(d.date.slice(8, 10), 10));

  return (
    <div className="bg-surface rounded-card mb-3 border border-hair shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-hair-light">
        <h3 className="text-[13px] font-bold">해빗 트래커</h3>
      </div>
      <div className="overflow-x-auto scrollbar-hide">
        <div className="inline-block min-w-full">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-surface z-10 px-2 py-1 text-[10px] font-bold text-ink-sub text-left min-w-[110px] border-r border-hair-light">
                  Habits
                </th>
                {dayTotals.map((d, i) => {
                  const isToday = d.date === todayStr;
                  return (
                    <th key={d.date}
                      className={
                        isToday
                          ? "px-1 py-1 text-[10px] text-primary font-extrabold w-7"
                          : "px-1 py-1 text-[10px] text-ink-muted w-7"
                      }>
                      {days[i]}
                    </th>
                  );
                })}
                <th className="sticky right-0 bg-surface z-10 px-2 py-1 text-[10px] font-bold text-ink-sub border-l border-hair-light">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row.item.id} className={ri < rows.length - 1 ? "border-b border-hair-light" : ""}>
                  <td className="sticky left-0 bg-surface z-10 px-2 py-1 border-r border-hair-light">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px]">{row.item.emoji}</span>
                      <span className="text-[11px] font-medium truncate max-w-[80px]">{row.item.name}</span>
                    </div>
                  </td>
                  {row.cells.map((c) => (
                    <td key={c.date} className="text-center w-7 h-7 align-middle">
                      {c.checked ? (
                        <span className="inline-block w-4 h-4 bg-success rounded-sm" />
                      ) : (
                        <span className="inline-block w-4 h-4 border border-hair rounded-sm" />
                      )}
                    </td>
                  ))}
                  <td className="sticky right-0 bg-surface z-10 px-2 py-1 text-[11px] font-bold text-center border-l border-hair-light">
                    {row.total}
                  </td>
                </tr>
              ))}
              {/* Done row */}
              <tr className="border-t-2 border-hair">
                <td className="sticky left-0 bg-hair-light z-10 px-2 py-1 text-[10px] font-bold text-ink-sub border-r border-hair-light">
                  Done
                </td>
                {dayTotals.map((d) => (
                  <td key={d.date} className="text-center text-[10px] font-semibold w-7 bg-hair-light">
                    {d.done}
                  </td>
                ))}
                <td className="sticky right-0 bg-hair-light z-10 border-l border-hair-light"></td>
              </tr>
              {/* Progress row */}
              <tr>
                <td className="sticky left-0 bg-hair-light z-10 px-2 py-1 text-[10px] font-bold text-ink-sub border-r border-hair-light">
                  %
                </td>
                {dayTotals.map((d) => (
                  <td key={d.date} className="text-center text-[10px] text-ink-muted w-7 bg-hair-light">
                    {d.pct}
                  </td>
                ))}
                <td className="sticky right-0 bg-hair-light z-10 border-l border-hair-light"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
