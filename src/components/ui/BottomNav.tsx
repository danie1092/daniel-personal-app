"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type IconProps = { active: boolean };

function HomeIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "var(--color-primary)" : "#C5CCD3"}>
      <path d="M3 11l9-8 9 8v10a2 2 0 01-2 2h-3v-7h-8v7H5a2 2 0 01-2-2z" />
    </svg>
  );
}

function WalletIcon({ active }: IconProps) {
  const fill = active ? "var(--color-primary)" : "#C5CCD3";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <rect x="3" y="6" width="18" height="14" rx="3" fill={fill} />
      <path d="M3 9V7a2 2 0 012-2h10l3 3" fill="none" stroke={fill} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17" cy="13" r="1.5" fill="white" />
    </svg>
  );
}

function MemoIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "var(--color-primary)" : "#C5CCD3"}>
      <path d="M5 4h11l3 3v13a1 1 0 01-1 1H5z" />
      <path d="M9 9h6M9 13h6M9 17h4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DiaryIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "var(--color-primary)" : "#C5CCD3"}>
      <path d="M12 21s-7-4.5-7-11a4 4 0 017-2.6A4 4 0 0119 10c0 6.5-7 11-7 11z" />
    </svg>
  );
}

function RoutineIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "var(--color-primary)" : "#C5CCD3"}>
      <circle cx="12" cy="12" r="10" />
      <path d="M7 12l3 3 7-7" stroke="white" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const tabs = [
  { href: "/home", label: "홈", Icon: HomeIcon },
  { href: "/budget", label: "가계부", Icon: WalletIcon },
  { href: "/memo", label: "메모", Icon: MemoIcon },
  { href: "/diary", label: "일기", Icon: DiaryIcon },
  { href: "/routine", label: "루틴", Icon: RoutineIcon },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-surface border-t border-hair-light z-50"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
    >
      <div className="flex items-center justify-around h-16 max-w-md mx-auto px-2">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2"
            >
              <tab.Icon active={active} />
              <span
                className={
                  active
                    ? "text-[10px] font-bold text-primary"
                    : "text-[10px] font-medium text-ink-muted"
                }
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
