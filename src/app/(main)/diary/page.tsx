import { Suspense } from "react";
import { getTodayDiary, getRecentDiaries, getMonthGrass } from "@/lib/diary/data";
import { DiaryGrass } from "./DiaryGrass";
import { DiaryInputCard } from "./DiaryInputCard";
import { DiaryPastList } from "./DiaryPastList";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function DiaryPage() {
  const today = new Date();
  const today_s = todayStr();
  const ym = currentYearMonth();

  const [todayDiary, recent, grass] = await Promise.all([
    getTodayDiary(today_s),
    getRecentDiaries(today_s),
    getMonthGrass(ym),
  ]);

  return (
    <div className="pb-24">
      {/* 날짜 헤더 */}
      <div className="px-5 pt-6 pb-4 bg-surface border-b border-hair-light">
        <p className="text-[11px] text-ink-muted">{today.getFullYear()}</p>
        <h1 className="text-[34px] font-extrabold tracking-tight leading-none mt-0.5">
          {today.getMonth() + 1}월 {today.getDate()}일
        </h1>
        <p className="text-[13px] text-ink-sub mt-1">{WEEKDAYS[today.getDay()]}요일</p>
      </div>

      <div className="px-4 pt-3">
        <DiaryGrass days={grass} todayStr={today_s} />

        <Suspense fallback={null}>
          <DiaryInputCard
            todayStr={today_s}
            initialContent={todayDiary?.content ?? ""}
            initialEmotion={todayDiary?.emotion ?? ""}
            isEdit={todayDiary !== null}
          />
        </Suspense>
      </div>

      <div className="mx-5 border-t border-hair-light my-3" />

      <div>
        <p className="text-[11px] text-ink-muted px-5 mb-3">지난 기록</p>
        <Suspense fallback={null}>
          <DiaryPastList entries={recent} />
        </Suspense>
      </div>
    </div>
  );
}
