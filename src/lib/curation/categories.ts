export const CURATION_CATEGORIES = [
  "음식·카페",
  "여행",
  "패션",
  "운동",
  "인테리어",
  "영감",
  "정보·꿀팁",
  "기타",
] as const;

export type CurationCategory = (typeof CURATION_CATEGORIES)[number];

export function isCurationCategory(v: unknown): v is CurationCategory {
  return typeof v === "string" && (CURATION_CATEGORIES as readonly string[]).includes(v);
}
