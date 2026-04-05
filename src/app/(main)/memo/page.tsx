"use client";

import { useState, useEffect, useCallback } from "react";
import { MEMO_TAGS } from "@/lib/constants";
import { TAG_COLORS } from "@/lib/memoColors";
import { supabase } from "@/lib/supabase";

type MemoEntry = {
  id: string;
  content: string;
  tag: string;
  created_at: string;
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 8) return `${d}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function MemoPage() {
  const [content, setContent] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>(MEMO_TAGS[0]);
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [memos, setMemos] = useState<MemoEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMemos = useCallback(async () => {
    const { data } = await supabase
      .from("memo_entries")
      .select("*")
      .order("created_at", { ascending: false });
    setMemos((data as MemoEntry[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMemos(); }, [fetchMemos]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("memo_entries").insert({
      content: content.trim(),
      tag: selectedTag,
    });
    if (!error) {
      setContent("");
      await fetchMemos();
    }
    setSaving(false);
  }

  // 클라이언트 사이드 필터
  const filtered = memos.filter((m) => {
    if (filterTag && m.tag !== filterTag) return false;
    if (search && !m.content.includes(search)) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-2 sticky top-0 bg-white z-10">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold">메모</h1>
        </div>

        {/* 입력창 */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 mb-2">
          <div className="flex gap-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="지금 떠오른 것을 기록해요"
              rows={2}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (content.trim()) handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-sm resize-none outline-none placeholder:text-gray-300"
            />
            <button type="submit" disabled={!content.trim() || saving}
              className="self-end px-3 py-2 bg-black text-white rounded-xl text-sm font-medium disabled:opacity-25 active:opacity-70"
            >{saving ? "..." : "저장"}</button>
          </div>

          {/* 태그 선택 */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {MEMO_TAGS.map((tag) => (
              <button key={tag} type="button" onClick={() => setSelectedTag(tag)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs transition-colors ${
                  selectedTag === tag ? "bg-black text-white" : "bg-gray-100 text-gray-500"
                }`}
              >{tag}</button>
            ))}
          </div>
        </form>

        {/* 검색 + 태그 필터 */}
        <div className="flex flex-col gap-1.5 pb-2 border-b border-gray-100">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="검색"
            className="w-full bg-gray-100 rounded-lg px-3 py-1.5 text-xs outline-none placeholder:text-gray-400" />
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            <button onClick={() => setFilterTag(null)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs ${
                filterTag === null ? "bg-black text-white" : "bg-gray-100 text-gray-500"
              }`}
            >전체</button>
            {MEMO_TAGS.map((tag) => (
              <button key={tag} onClick={() => setFilterTag(tag === filterTag ? null : tag)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs ${
                  filterTag === tag ? "bg-black text-white" : "bg-gray-100 text-gray-500"
                }`}
              >{tag}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 메모 그리드 */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <p className="text-center text-gray-300 text-xs py-12">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-300 text-xs py-12">
            {search || filterTag ? "검색 결과가 없어요" : "아직 메모가 없어요"}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((memo) => (
              <div key={memo.id}
                className={`${TAG_COLORS[memo.tag] ?? "bg-gray-50"} rounded-xl p-3 flex flex-col gap-1.5 min-h-[80px]`}
              >
                <span className="text-[10px] text-gray-400">{memo.tag}</span>
                <p className="text-xs text-gray-800 leading-relaxed line-clamp-5 flex-1">
                  {memo.content}
                </p>
                <span className="text-[10px] text-gray-300 mt-auto">{timeAgo(memo.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
