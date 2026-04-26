"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const TABS = [
  { key: "details", label: "세부내역" },
  { key: "input", label: "입력" },
  { key: "summary", label: "월별요약" },
] as const;

export type BudgetTab = (typeof TABS)[number]["key"];

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
    <div className="flex gap-1.5 px-4 pb-2 bg-surface">
      {TABS.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => go(t.key)}
            className={
              isActive
                ? "px-3 py-1.5 rounded-input bg-ink text-white text-[12px] font-bold"
                : "px-3 py-1.5 rounded-input bg-hair-light text-ink-sub text-[12px] font-semibold"
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
