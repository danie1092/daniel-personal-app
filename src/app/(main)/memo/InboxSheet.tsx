"use client";

import { useState, useTransition } from "react";
import { MEMO_TAGS } from "@/lib/constants";
import { TAG_COLORS } from "@/lib/memoColors";
import type { CollectedItem } from "@/lib/memo/list";
import { organizeInbox, saveInboxGroups, type InboxGroup } from "./actions";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

type Props = {
  initialItems: CollectedItem[];
  onClose: () => void;
};

export function InboxSheet({ initialItems, onClose }: Props) {
  const [items] = useState<CollectedItem[]>(initialItems);
  const [groups, setGroups] = useState<InboxGroup[] | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleOrganize() {
    setOrganizing(true);
    setError(null);
    try {
      const r = await organizeInbox();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setGroups(r.groups);
    } finally {
      setOrganizing(false);
    }
  }

  function handleSave() {
    if (!groups) return;
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const r = await saveInboxGroups(groups);
      if (!r.ok) {
        setError(r.error);
        setSaving(false);
        return;
      }
      onClose();
    });
  }

  function updateGroupContent(i: number, content: string) {
    if (!groups) return;
    const next = [...groups];
    next[i] = { ...next[i], content };
    setGroups(next);
  }

  function updateGroupTag(i: number, tag: string) {
    if (!groups) return;
    const next = [...groups];
    next[i] = { ...next[i], tag };
    setGroups(next);
  }

  function removeGroup(i: number) {
    if (!groups) return;
    setGroups(groups.filter((_, idx) => idx !== i));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mt-auto bg-surface rounded-t-sheet max-h-[85vh] flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hair-light">
          <h2 className="text-[16px] font-bold">채집함</h2>
          <button onClick={onClose} className="text-[13px] text-ink-sub">닫기</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {groups ? (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] text-ink-sub">AI가 정리한 메모 초안이에요. 수정 후 저장하세요.</p>
              {groups.map((g, i) => (
                <div key={i} className={`${TAG_COLORS[g.tag] ?? "bg-hair-light"} rounded-card p-3 flex flex-col gap-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold">{g.topic}</span>
                    <button onClick={() => removeGroup(i)} className="text-[10px] text-danger">제거</button>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {MEMO_TAGS.map((t) => (
                      <button
                        key={t}
                        onClick={() => updateGroupTag(i, t)}
                        className={
                          g.tag === t
                            ? "px-2 py-0.5 rounded-chip bg-ink text-white text-[10px] font-bold"
                            : "px-2 py-0.5 rounded-chip bg-white/60 text-ink-sub text-[10px]"
                        }
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={g.content}
                    onChange={(e) => updateGroupContent(i, e.target.value)}
                    rows={4}
                    className="w-full bg-white/60 rounded-input px-2.5 py-2 text-[12px] resize-none outline-none leading-relaxed"
                  />
                  <span className="text-[10px] text-ink-muted">{g.item_ids.length}개 항목</span>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-[12px] text-ink-muted py-8">수집된 항목이 없어요</p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <div key={item.id} className="bg-hair-light rounded-card p-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 bg-surface rounded-chip text-ink-sub">{item.source}</span>
                    <span className="text-[10px] text-ink-muted">{timeAgo(item.created_at)}</span>
                  </div>
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-primary truncate">
                    {item.url}
                  </a>
                  {item.memo && <p className="text-[11px] text-ink-sub">{item.memo}</p>}
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-[11px] text-danger mt-3">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-hair-light">
          {groups ? (
            <button
              onClick={handleSave}
              disabled={saving || groups.length === 0}
              className="w-full py-2.5 bg-ink text-white rounded-input text-[13px] font-bold disabled:opacity-25 active:opacity-70"
            >
              {saving ? "저장 중..." : `메모 ${groups.length}개 저장`}
            </button>
          ) : (
            <button
              onClick={handleOrganize}
              disabled={organizing || items.length === 0}
              className="w-full py-2.5 bg-primary text-white rounded-input text-[13px] font-bold disabled:opacity-25 active:opacity-70"
            >
              {organizing ? "AI가 정리 중..." : "AI로 정리"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
