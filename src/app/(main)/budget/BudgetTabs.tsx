"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const TABS = [
  { key: "details", label: "세부내역" },
  { key: "tracker", label: "예산" },
  { key: "summary", label: "월별요약" },
  { key: "fixed", label: "고정·구독" },
] as const;

/** input은 탭 버튼 없이 세부내역의 '빠른 입력' 버튼으로만 진입 */
export type BudgetTab = (typeof TABS)[number]["key"] | "input";

export function BudgetTabs({ active }: { active: BudgetTab }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  function go(tab: BudgetTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "details") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex gap-1.5 px-4 pt-2.5 pb-2 bg-surface overflow-x-auto scrollbar-hide">
      {TABS.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => go(t.key)}
            className={
              isActive
                ? "shrink-0 px-3 py-1.5 rounded-input bg-ink text-white text-[12px] font-bold"
                : "shrink-0 px-3 py-1.5 rounded-input bg-hair-light text-ink-sub text-[12px] font-semibold"
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
