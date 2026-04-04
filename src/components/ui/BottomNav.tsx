"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/home", label: "홈", icon: "🏠" },
  { href: "/budget", label: "가계부", icon: "💰" },
  { href: "/diary", label: "일기", icon: "📔" },
  { href: "/memo", label: "메모", icon: "📝" },
  { href: "/routine", label: "루틴", icon: "🔄" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 safe-area-pb z-50">
      <div className="flex items-center justify-around h-14 max-w-md mx-auto px-2">
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
              <span className="text-2xl leading-none">{tab.icon}</span>
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
