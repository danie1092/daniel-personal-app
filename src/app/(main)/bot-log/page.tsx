import { getRecentBotLog } from "@/lib/botLog/recent";
import { BotLogList } from "./BotLogList";

export const dynamic = "force-dynamic";

export default async function BotLogPage() {
  const entries = await getRecentBotLog(7);
  return (
    <div className="pb-24">
      <div className="bg-surface px-4 pt-5 pb-3 border-b border-hair-light">
        <h1 className="text-[18px] font-extrabold tracking-tight">이지은이 기록한 것</h1>
        <p className="text-[12px] text-ink-sub mt-1">최근 7일 · {entries.length}건</p>
      </div>
      <BotLogList entries={entries} />
    </div>
  );
}
