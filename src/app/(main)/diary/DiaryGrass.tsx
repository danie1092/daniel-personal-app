import type { GrassDay } from "@/lib/diary/data";
import { EMOTION_TOKENS, type DiaryEmotion } from "./emotionTokens";

type Props = {
  days: GrassDay[];
  todayStr: string;
};

export function DiaryGrass({ days, todayStr }: Props) {
  const written = days.filter((d) => d.entry !== null).length;
  return (
    <div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-bold">이번 달 잔디</h3>
        <span className="text-[11px] text-ink-sub">{written}일 / {days.length}일</span>
      </div>
      <div className="grid grid-cols-15 gap-1" style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}>
        {days.map((d) => {
          const isToday = d.date === todayStr;
          if (d.entry === null) {
            return (
              <div
                key={d.date}
                className={
                  isToday
                    ? "aspect-square rounded-sm border-2 border-primary"
                    : "aspect-square rounded-sm bg-hair-light"
                }
              />
            );
          }
          const tok = d.entry.emotion ? EMOTION_TOKENS[d.entry.emotion as DiaryEmotion] : null;
          return (
            <div
              key={d.date}
              className={
                isToday
                  ? "aspect-square rounded-sm border-2 border-primary"
                  : "aspect-square rounded-sm"
              }
              style={{ backgroundColor: tok?.dotHex ?? "#22C55E" }}
              title={`${d.date} ${tok?.label ?? ""}`}
            />
          );
        })}
      </div>
    </div>
  );
}
