"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { BUDGET_CATEGORIES } from "@/lib/constants";

const FILTERED_CATEGORIES = BUDGET_CATEGORIES.filter((c) => c !== "월급" && c !== "저축");

export function DetailsFilter({ active }: { active: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  function go(cat: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (cat) params.set("cat", cat);
    else params.delete("cat");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex gap-1.5 px-4 py-2 overflow-x-auto scrollbar-hide">
      <button
        onClick={() => go(null)}
        className={
          active === null
            ? "flex-shrink-0 px-3 py-1.5 rounded-chip bg-ink text-white text-[12px] font-bold"
            : "flex-shrink-0 px-3 py-1.5 rounded-chip bg-surface border border-hair text-ink-sub text-[12px] font-semibold"
        }
      >
        전체
      </button>
      {FILTERED_CATEGORIES.map((c) => {
        const isActive = active === c;
        return (
          <button
            key={c}
            onClick={() => go(c)}
            className={
              isActive
                ? "flex-shrink-0 px-3 py-1.5 rounded-chip bg-ink text-white text-[12px] font-bold"
                : "flex-shrink-0 px-3 py-1.5 rounded-chip bg-surface border border-hair text-ink-sub text-[12px] font-semibold"
            }
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}
