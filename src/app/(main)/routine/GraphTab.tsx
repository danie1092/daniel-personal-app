import type { MonthGraphData } from "@/lib/routine/graphData";
import { HabitGrid } from "./HabitGrid";
import { ProgressLineChart } from "./ProgressLineChart";
import { StreaksCard } from "./StreaksCard";

type Props = {
  data: MonthGraphData;
  todayStr: string;
};

export function GraphTab({ data, todayStr }: Props) {
  return (
    <div className="px-4 py-3">
      <HabitGrid rows={data.rows} dayTotals={data.dayTotals} todayStr={todayStr} />
      <ProgressLineChart dayTotals={data.dayTotals} todayStr={todayStr} />
      <StreaksCard streaks={data.streaks} />
    </div>
  );
}
