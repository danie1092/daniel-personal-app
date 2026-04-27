import type { Parsed, ParseFn } from "./types";
import { parseHyundai } from "./hyundai";
import { parseWoori } from "./woori";

const parsers: ParseFn[] = [parseHyundai, parseWoori];

/**
 * 모든 파서를 순서대로 시도. 첫 매칭 결과 반환. 모두 null이면 null.
 * 새 카드 추가 시: src/lib/budget/parsers/<카드>.ts 작성 + 위 배열에 추가.
 */
export function parse(text: string, smsDate: Date): Parsed | null {
  for (const fn of parsers) {
    const result = fn(text, smsDate);
    if (result) return result;
  }
  return null;
}

export type { Parsed };
