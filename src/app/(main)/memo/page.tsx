"use client";

import { useState, useEffect, useCallback } from "react";
import { MEMO_TAGS } from "@/lib/constants";
import { TAG_COLORS } from "@/lib/memoColors";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type MemoEntry = {
  id: string;
  content: string;
  tag: string;
  created_at: string;
};

type CollectedItem = {
  id: string;
  url: string;
  memo: string | null;
  source: string;
  created_at: string;
};

type OrganizedGroup = {
  topic: string;
  tag: string;
  content: string;
  item_ids: string[];
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

  // Inbox state
  const [inboxCount, setInboxCount] = useState(0);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxItems, setInboxItems] = useState<CollectedItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [organizedGroups, setOrganizedGroups] = useState<OrganizedGroup[] | null>(null);
  const [savingInbox, setSavingInbox] = useState(false);

  const fetchMemos = useCallback(async () => {
    const { data } = await supabase
      .from("memo_entries")
      .select("*")
      .order("created_at", { ascending: false });
    setMemos((data as MemoEntry[]) ?? []);
    setLoading(false);
  }, []);

  const fetchInboxCount = useCallback(async () => {
    const { count } = await supabase
      .from("collected_items")
      .select("*", { count: "exact", head: true })
      .eq("is_processed", false);
    setInboxCount(count ?? 0);
  }, []);

  useEffect(() => {
    fetchMemos();
    fetchInboxCount();
  }, [fetchMemos, fetchInboxCount]);

  async function openInbox() {
    setInboxOpen(true);
    setInboxLoading(true);
    setOrganizedGroups(null);
    const { data } = await supabase
      .from("collected_items")
      .select("*")
      .eq("is_processed", false)
      .order("created_at", { ascending: false });
    setInboxItems((data as CollectedItem[]) ?? []);
    setInboxLoading(false);
  }

  async function handleOrganize() {
    setOrganizing(true);
    try {
      const res = await fetch("/api/inbox/organize", { method: "POST" });
      const data = await res.json();
      if (data.groups) {
        setOrganizedGroups(data.groups);
      }
    } catch {
      alert("AI 정리 중 오류가 발생했어요");
    }
    setOrganizing(false);
  }

  async function handleSaveGroups() {
    if (!organizedGroups) return;
    setSavingInbox(true);
    try {
      const res = await fetch("/api/inbox/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: organizedGroups }),
      });
      const data = await res.json();
      if (data.success) {
        setInboxOpen(false);
        setOrganizedGroups(null);
        setInboxItems([]);
        await Promise.all([fetchMemos(), fetchInboxCount()]);
      }
    } catch {
      alert("저장 중 오류가 발생했어요");
    }
    setSavingInbox(false);
  }

  function updateGroupContent(index: number, newContent: string) {
    if (!organizedGroups) return;
    const updated = [...organizedGroups];
    updated[index] = { ...updated[index], content: newContent };
    setOrganizedGroups(updated);
  }

  function updateGroupTag(index: number, newTag: string) {
    if (!organizedGroups) return;
    const updated = [...organizedGroups];
    updated[index] = { ...updated[index], tag: newTag };
    setOrganizedGroups(updated);
  }

  function removeGroup(index: number) {
    if (!organizedGroups) return;
    setOrganizedGroups(organizedGroups.filter((_, i) => i !== index));
  }

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
          {inboxCount > 0 && (
            <button
              onClick={openInbox}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-medium active:bg-blue-100 transition-colors"
            >
              채집함
              <span className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
                {inboxCount}
              </span>
            </button>
          )}
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

      {/* 채집함 오버레이 */}
      {inboxOpen && (
        <div className="fixed inset-0 z-50 flex flex-col">
          {/* 배경 */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setInboxOpen(false); setOrganizedGroups(null); }}
          />
          {/* 패널 */}
          <div className="relative mt-auto bg-white rounded-t-2xl max-h-[85vh] flex flex-col animate-slide-up">
            {/* 패널 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-base font-bold">채집함</h2>
              <button
                onClick={() => { setInboxOpen(false); setOrganizedGroups(null); }}
                className="text-gray-400 text-sm"
              >닫기</button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {inboxLoading ? (
                <p className="text-center text-gray-300 text-xs py-8">불러오는 중...</p>
              ) : organizedGroups ? (
                /* AI 정리 결과 */
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-gray-500">AI가 정리한 메모 초안이에요. 수정 후 저장하세요.</p>
                  {organizedGroups.map((group, i) => (
                    <div key={i} className={`${TAG_COLORS[group.tag] ?? "bg-gray-50"} rounded-xl p-3 flex flex-col gap-2`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-700">{group.topic}</span>
                        <button onClick={() => removeGroup(i)} className="text-[10px] text-red-400">제거</button>
                      </div>
                      {/* 태그 선택 */}
                      <div className="flex gap-1 flex-wrap">
                        {MEMO_TAGS.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => updateGroupTag(i, tag)}
                            className={`px-2 py-0.5 rounded-full text-[10px] ${
                              group.tag === tag ? "bg-black text-white" : "bg-white/60 text-gray-500"
                            }`}
                          >{tag}</button>
                        ))}
                      </div>
                      <textarea
                        value={group.content}
                        onChange={(e) => updateGroupContent(i, e.target.value)}
                        rows={4}
                        className="w-full bg-white/60 rounded-lg px-2.5 py-2 text-xs text-gray-800 resize-none outline-none leading-relaxed"
                      />
                      <span className="text-[10px] text-gray-400">{group.item_ids.length}개 항목</span>
                    </div>
                  ))}
                </div>
              ) : inboxItems.length === 0 ? (
                <p className="text-center text-gray-300 text-xs py-8">수집된 항목이 없어요</p>
              ) : (
                /* 수집 URL 목록 */
                <div className="flex flex-col gap-2">
                  {inboxItems.map((item) => (
                    <div key={item.id} className="bg-gray-50 rounded-xl p-3 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 rounded text-gray-500">{item.source}</span>
                        <span className="text-[10px] text-gray-300">{timeAgo(item.created_at)}</span>
                      </div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 truncate"
                      >{item.url}</a>
                      {item.memo && (
                        <p className="text-[11px] text-gray-500">{item.memo}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 패널 하단 버튼 */}
            <div className="px-4 py-3 border-t border-gray-100">
              {organizedGroups ? (
                <button
                  onClick={handleSaveGroups}
                  disabled={savingInbox || organizedGroups.length === 0}
                  className="w-full py-2.5 bg-black text-white rounded-xl text-sm font-medium disabled:opacity-25 active:opacity-70"
                >
                  {savingInbox ? "저장 중..." : `메모 ${organizedGroups.length}개 저장`}
                </button>
              ) : (
                <button
                  onClick={handleOrganize}
                  disabled={organizing || inboxItems.length === 0}
                  className="w-full py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium disabled:opacity-25 active:opacity-70"
                >
                  {organizing ? "AI가 정리 중..." : "AI로 정리"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
