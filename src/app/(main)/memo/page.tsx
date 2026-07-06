import { Suspense } from "react";
import { getAllMemos } from "@/lib/memo/list";
import { MemoTab } from "./MemoTab";

export const dynamic = "force-dynamic";

export default async function MemoPage() {
  const memos = await getAllMemos();

  return (
    <div className="pb-24">
      {/* 헤더 */}
      <div className="bg-surface px-4 pt-5 pb-3 border-b border-hair-light">
        <h1 className="text-[18px] font-extrabold tracking-tight">메모</h1>
      </div>

      <Suspense fallback={null}>
        <MemoTab memos={memos} />
      </Suspense>
    </div>
  );
}
