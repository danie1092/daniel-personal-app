"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const TABS = [
  { key: "check", label: "체크" },
  { key: "graph", label: "그래프" },
  { key: "settings", label: "설정" },
] as const;

export type RoutineTab = (typeof TABS)[number]["key"];

export function RoutineTabs({ active }: { active: RoutineTab }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  function go(tab: RoutineTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "check") {
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
