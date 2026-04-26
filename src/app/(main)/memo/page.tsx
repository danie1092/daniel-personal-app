import { Suspense } from "react";
import Link from "next/link";
import { getAllMemos, getInboxCount, getInboxItems } from "@/lib/memo/list";
import { MemoTab } from "./MemoTab";
import { InboxButton } from "./InboxButton";
import { MemoCurationPlaceholder } from "./MemoCurationPlaceholder";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ tab?: string }>;

export default async function MemoPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const activeTab = params.tab === "curation" ? "curation" : "memo";

  const [memos, inboxCount, inboxItems] = await Promise.all([
    activeTab === "memo" ? getAllMemos() : Promise.resolve([]),
    getInboxCount(),
    activeTab === "memo" ? getInboxItems() : Promise.resolve([]),
  ]);

  return (
    <div className="pb-24">
      {/* 헤더 */}
      <div className="bg-surface px-4 pt-5 pb-3 border-b border-hair-light flex items-center justify-between">
        <h1 className="text-[18px] font-extrabold tracking-tight">메모</h1>
        <Suspense fallback={null}>
          <InboxButton count={inboxCount} items={inboxItems} />
        </Suspense>
      </div>

      {/* 탭 헤더 */}
      <div className="flex gap-1.5 px-4 pt-3 pb-2 bg-surface">
        <Link
          href="/memo"
          replace
          className={
            activeTab === "memo"
              ? "px-3 py-1.5 rounded-input bg-ink text-white text-[12px] font-bold"
              : "px-3 py-1.5 rounded-input bg-hair-light text-ink-sub text-[12px] font-semibold"
          }
        >
          메모
        </Link>
        <Link
          href="/memo?tab=curation"
          replace
          className={
            activeTab === "curation"
              ? "px-3 py-1.5 rounded-input bg-ink text-white text-[12px] font-bold"
              : "px-3 py-1.5 rounded-input bg-hair-light text-ink-sub text-[12px] font-semibold"
          }
        >
          큐레이션
        </Link>
      </div>

      {activeTab === "memo" ? (
        <Suspense fallback={null}>
          <MemoTab memos={memos} />
        </Suspense>
      ) : (
        <MemoCurationPlaceholder />
      )}
    </div>
  );
}
