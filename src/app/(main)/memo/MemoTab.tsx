"use client";

import { useState } from "react";
import type { MemoEntry } from "@/lib/memo/list";
import { MemoInputCard } from "./MemoInputCard";
import { MemoSearchFilter } from "./MemoSearchFilter";
import { MemoGrid } from "./MemoGrid";

export function MemoTab({ memos }: { memos: MemoEntry[] }) {
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);

  return (
    <div>
      <div className="px-4 pt-3">
        <MemoInputCard />
      </div>
      <MemoSearchFilter
        search={search}
        onSearchChange={setSearch}
        filterTag={filterTag}
        onFilterChange={setFilterTag}
      />
      <MemoGrid memos={memos} search={search} filterTag={filterTag} />
    </div>
  );
}
