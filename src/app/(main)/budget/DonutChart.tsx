import { CATEGORY_TOKENS, type BudgetCategory } from "@/lib/budget/categoryTokens";

type Slice = { category: BudgetCategory; amount: number };

export function DonutChart({ data }: { data: Slice[] }) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  const size = 180;
  const radius = 64;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 24;
  const circ = 2 * Math.PI * radius;

  if (total === 0) {
    return (
      <div className="w-[180px] h-[180px] mx-auto flex flex-col items-center justify-center text-ink-muted">
        <div className="text-[11px]">데이터 없음</div>
      </div>
    );
  }

  let cursor = 0;
  const segments = data.map((d) => {
    const pct = d.amount / total;
    const dash = Math.max(pct * circ - 2, 0);
    const offset = cursor;
    cursor += pct;
    return { ...d, pct, dash, offset };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto block">
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#F2F4F6" strokeWidth={strokeWidth} />
      {segments.map((s) => (
        <circle
          key={s.category}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={CATEGORY_TOKENS[s.category]?.hex ?? "#D1D5DB"}
          strokeWidth={strokeWidth}
          strokeDasharray={`${s.dash} ${circ}`}
          strokeDashoffset={-s.offset * circ}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" className="fill-ink-sub" style={{ fontSize: 11 }}>
        총 지출
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" className="fill-ink" style={{ fontSize: 18, fontWeight: 800 }}>
        {(total / 10000).toFixed(0)}만원
      </text>
    </svg>
  );
}
