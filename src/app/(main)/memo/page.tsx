import { Suspense } from "react";
import Link from "next/link";
import { getAllMemos } from "@/lib/memo/list";
import { getCurationItems, getCategoryCounts, type CurationFilter, type CurationItem } from "@/lib/curation/data";
import { isCurationCategory } from "@/lib/curation/categories";
import { MemoTab } from "./MemoTab";
import { CurationTab } from "./curation/CurationTab";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ tab?: string; cat?: string }>;

export default async function MemoPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const activeTab = params.tab === "curation" ? "curation" : "memo";

  const memos = activeTab === "memo" ? await getAllMemos() : [];

  let curationItems: CurationItem[] = [];
  let curationCounts: Record<CurationFilter, number> | null = null;
  let activeFilter: CurationFilter = "all";

  if (activeTab === "curation") {
    if (params.cat === "dead-letter") activeFilter = "dead-letter";
    else if (params.cat && isCurationCategory(params.cat)) activeFilter = params.cat;

    [curationItems, curationCounts] = await Promise.all([
      getCurationItems(activeFilter),
      getCategoryCounts(),
    ]);
  }

  return (
    <div className="pb-24">
      {/* 헤더 */}
      <div className="bg-surface px-4 pt-5 pb-3 border-b border-hair-light">
        <h1 className="text-[18px] font-extrabold tracking-tight">메모</h1>
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
      ) : curationCounts ? (
        <CurationTab
          items={curationItems}
          counts={curationCounts}
          activeFilter={activeFilter}
        />
      ) : null}
    </div>
  );
}
