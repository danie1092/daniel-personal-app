"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { excludeSubscription } from "./actions";

/** 구독 탭 행 삭제 — 잘못 탐지된 항목을 제외 목록에 넣어 숨긴다 */
export function SubscriptionDeleteButton({ merchantKey, name }: { merchantKey: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!confirm(`'${name}' 을(를) 구독 목록에서 지울까요?\n(결제 내역은 그대로, 이 탭에서만 숨겨져요)`)) return;
    startTransition(async () => {
      const result = await excludeSubscription(merchantKey);
      if (result.ok) router.refresh();
      else alert(result.error);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      aria-label={`${name} 구독 목록에서 삭제`}
      className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-ink-muted active:bg-hair-light disabled:opacity-50"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}
