"use client";

import { useState, useEffect, useRef } from "react";
import { DIARY_EMOTIONS } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { playTypingSound } from "@/lib/acSound";

const EMOTION_META: Record<string, { emoji: string; label: string; bg: string }> = {
  "😊 행복": { emoji: "😊", label: "행복", bg: "bg-yellow-50" },
  "😌 평온": { emoji: "😌", label: "평온", bg: "bg-blue-50" },
  "😔 슬픔": { emoji: "😔", label: "슬픔", bg: "bg-indigo-50" },
  "😤 화남": { emoji: "😤", label: "화남", bg: "bg-red-50" },
  "😰 불안": { emoji: "😰", label: "불안", bg: "bg-orange-50" },
  "😴 피곤": { emoji: "😴", label: "피곤", bg: "bg-gray-50" },
  "🥰 설렘": { emoji: "🥰", label: "설렘", bg: "bg-pink-50" },
  "😐 보통": { emoji: "😐", label: "보통", bg: "bg-gray-50" },
};

type DiaryEntry = {
  id: string;
  date: string;
  content: string;
  emotion: string | null;
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return { month: d.getMonth() + 1, day: d.getDate(), dow: days[d.getDay()] };
}

export default function DiaryPage() {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const days = ["일", "월", "화", "수", "목", "금", "토"];

  const [content, setContent] = useState("");
  const [emotion, setEmotion] = useState("");
  const [saving, setSaving] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [pastEntries, setPastEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // 타이핑 소리: 이전 길이와 비교해 글자가 추가됐을 때만 재생
  const prevLenRef = useRef(0);

  useEffect(() => {
    async function fetchData() {
      const [todayRes, pastRes] = await Promise.all([
        supabase.from("diary_entries").select("*").eq("date", todayStr).single(),
        supabase.from("diary_entries").select("*")
          .lt("date", todayStr)
          .order("date", { ascending: false })
          .limit(30),
      ]);
      if (todayRes.data) {
        const entry = todayRes.data as DiaryEntry;
        setContent(entry.content);
        prevLenRef.current = entry.content.length;
        setEmotion(entry.emotion ?? "");
        setIsEdit(true);
      }
      setPastEntries((pastRes.data as DiaryEntry[]) ?? []);
      setLoading(false);
    }
    fetchData();
  }, [todayStr]);

  function handleContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    // 글자가 추가됐을 때(길이 증가)만 효과음 재생
    if (next.length > prevLenRef.current) {
      playTypingSound(next[next.length - 1] ?? "a");
    }
    prevLenRef.current = next.length;
    setContent(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("diary_entries").upsert(
      { date: todayStr, content: content.trim(), emotion: emotion || null },
      { onConflict: "date" }
    );
    if (!error) setIsEdit(true);
    setSaving(false);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {/* 날짜 헤더 */}
        <div className="px-5 pt-8 pb-4">
          <p className="text-xs text-gray-400 mb-0.5">{today.getFullYear()}</p>
          <h1 className="text-4xl font-medium leading-none tracking-tight">
            {today.getMonth() + 1}월 {today.getDate()}일
          </h1>
          <p className="text-sm text-gray-400 mt-1">{days[today.getDay()]}요일</p>
        </div>

        {/* 감정 태그 */}
        <div className="px-5 mb-4">
          <p className="text-[11px] text-gray-400 mb-2">오늘 기분</p>
          <div className="flex flex-wrap gap-1.5">
            {DIARY_EMOTIONS.map((em) => {
              const meta = EMOTION_META[em];
              const isSelected = emotion === em;
              return (
                <button key={em} type="button"
                  onClick={() => setEmotion(em === emotion ? "" : em)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs transition-all ${
                    isSelected ? "bg-black text-white" : `${meta.bg} text-gray-600`
                  }`}
                >
                  <span className="text-sm leading-none">{meta.emoji}</span>
                  <span className="font-medium">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 오늘 일기 입력 */}
        <form onSubmit={handleSubmit} className="px-5 mb-6">
          <textarea
            value={content}
            onChange={handleContentChange}
            placeholder="오늘 하루를 기록해요"
            rows={4}
            className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm leading-relaxed resize-none outline-none placeholder:text-gray-300 mb-2"
          />
          <button type="submit" disabled={!content.trim() || saving}
            className="w-full py-3 bg-black text-white rounded-2xl text-sm font-medium active:opacity-75 disabled:opacity-25"
          >
            {saving ? "저장 중..." : isEdit ? "수정" : "저장"}
          </button>
        </form>

        <div className="mx-5 border-t border-gray-100 mb-4" />

        {/* 과거 일기 목록 */}
        <div className="px-5 pb-6">
          <p className="text-[11px] text-gray-400 mb-3">지난 기록</p>
          {loading ? (
            <p className="text-center text-gray-300 text-xs py-6">불러오는 중...</p>
          ) : pastEntries.length === 0 ? (
            <p className="text-center text-gray-300 text-xs py-6">아직 기록이 없어요</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pastEntries.map((entry) => {
                const { month, day, dow } = formatDate(entry.date);
                const meta = entry.emotion ? EMOTION_META[entry.emotion] : null;
                return (
                  <div key={entry.id}
                    className={`${meta?.bg ?? "bg-gray-50"} rounded-2xl px-4 py-3 flex gap-3 items-start`}
                  >
                    <div className="flex-shrink-0 text-center w-8">
                      <p className="text-[10px] text-gray-400">{month}/{day}</p>
                      <p className="text-[10px] text-gray-400">{dow}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      {meta && (
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-sm">{meta.emoji}</span>
                          <span className="text-[10px] text-gray-400">{meta.label}</span>
                        </div>
                      )}
                      <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">
                        {entry.content}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
