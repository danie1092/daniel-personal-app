import type { DayTotal } from "@/lib/routine/graphData";

type Props = {
  dayTotals: DayTotal[];
  todayStr: string;
};

export function ProgressLineChart({ dayTotals, todayStr }: Props) {
  if (dayTotals.length === 0) return null;

  const W = 320;
  const H = 140;
  const padL = 24;
  const padR = 8;
  const padT = 12;
  const padB = 22;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = dayTotals.length;

  const xOf = (i: number) => padL + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
  const yOf = (v: number) => padT + chartH - (v / 100) * chartH;

  const pathD = dayTotals
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xOf(i)} ${yOf(d.pct)}`)
    .join(" ");

  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
      <h3 className="text-[13px] font-bold mb-3">월간 진행률</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block">
        {/* Y 격자 */}
        {yTicks.map((v) => {
          const y = yOf(v);
          return (
            <g key={v}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#F2F4F6" strokeWidth="1" />
              <text x={padL - 4} y={y + 3.5} textAnchor="end" fontSize="8" fill="#C5CCD3">{v}</text>
            </g>
          );
        })}

        {/* 면적 */}
        {n > 1 && (
          <path
            d={`${pathD} L ${xOf(n - 1)} ${yOf(0)} L ${xOf(0)} ${yOf(0)} Z`}
            fill="#22C55E"
            fillOpacity="0.08"
          />
        )}

        {/* 선 */}
        {n > 1 && (
          <path d={pathD} fill="none" stroke="#22C55E" strokeWidth="1.8"
            strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* 점 */}
        {dayTotals.map((d, i) => {
          const x = xOf(i);
          const y = yOf(d.pct);
          const isToday = d.date === todayStr;
          const day = parseInt(d.date.slice(8, 10), 10);
          const showLabel = n <= 7 || day === 1 || day % 5 === 0 || isToday;
          return (
            <g key={d.date}>
              {showLabel && (
                <text x={x} y={H - 4} textAnchor="middle" fontSize="8"
                  fill={isToday ? "#2E6FF2" : "#8B95A1"}
                  fontWeight={isToday ? "700" : "400"}
                >{day}</text>
              )}
              {isToday && (
                <circle cx={x} cy={y} r={3.5} fill="#22C55E" />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
