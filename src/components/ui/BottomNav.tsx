"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/home", label: "홈", icon: "/images/icon-home.png" },
  { href: "/budget", label: "가계부", icon: "/images/icon-budget.png" },
  { href: "/diary", label: "일기", icon: "/images/icon-diary.png" },
  { href: "/memo", label: "메모", icon: "/images/icon-memo.png" },
  { href: "/routine", label: "루틴", icon: "/images/icon-routine.png" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
      <div className="flex items-center justify-around h-16 max-w-md mx-auto px-2">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-opacity ${
                isActive ? "opacity-100" : "opacity-40"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tab.icon}
                alt={tab.label}
                width={36}
                height={36}
                style={{ imageRendering: "pixelated" }}
              />
              <span
                className={`text-[10px] font-medium ${
                  isActive ? "text-black" : "text-gray-500"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
