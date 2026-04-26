const CATEGORIES = [
  "음식·카페",
  "여행",
  "패션",
  "운동",
  "인테리어",
  "영감",
  "정보·꿀팁",
  "기타",
] as const;

export function MemoCurationPlaceholder() {
  return (
    <div className="px-4 py-12 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-primary-soft flex items-center justify-center text-3xl mb-4">
        📥
      </div>
      <h2 className="text-[16px] font-bold mb-2">큐레이션</h2>
      <p className="text-[13px] text-ink-sub leading-relaxed mb-6 max-w-xs">
        Phase 2에서 자동 수집 시작 — 인스타에서 단축어로 보낸 링크가 여기 카테고리별로 정리됩니다.
      </p>
      <div className="flex gap-1.5 flex-wrap justify-center max-w-xs">
        {CATEGORIES.map((c) => (
          <span
            key={c}
            className="text-[11px] px-2.5 py-1 bg-hair-light text-ink-muted rounded-chip font-semibold"
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}
