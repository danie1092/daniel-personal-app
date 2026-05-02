import { getRecentProfile } from "@/lib/profileLog/recent";
import { ProfileLogList } from "./ProfileLogList";

export const dynamic = "force-dynamic";

export default async function ProfileLogPage() {
  const entries = await getRecentProfile(30);
  return (
    <div className="pb-24">
      <div className="bg-surface px-4 pt-5 pb-3 border-b border-hair-light">
        <h1 className="text-[18px] font-extrabold tracking-tight">이지은이 알게 된 너</h1>
        <p className="text-[12px] text-ink-sub mt-1">활성 관찰 · {entries.length}건 (최대 30)</p>
      </div>
      <ProfileLogList entries={entries} />
    </div>
  );
}
