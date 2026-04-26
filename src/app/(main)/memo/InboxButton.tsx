"use client";

import { useState } from "react";
import type { CollectedItem } from "@/lib/memo/list";
import { InboxSheet } from "./InboxSheet";

type Props = {
  count: number;
  items: CollectedItem[];
};

export function InboxButton({ count, items }: Props) {
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-soft text-primary rounded-input text-[11px] font-semibold active:opacity-70"
      >
        채집함
        <span className="bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
          {count}
        </span>
      </button>
      {open && <InboxSheet initialItems={items} onClose={() => setOpen(false)} />}
    </>
  );
}
