import { describe, it, expect } from "vitest";
import { jaccardSimilarity, findConflictCandidates } from "./consolidate.js";
import type { ProfileRow } from "../db/userProfile.js";

function row(id: string, kind: ProfileRow["kind"], obs: string): ProfileRow {
  return {
    id,
    kind,
    observation: obs,
    evidence_dates: [],
    superseded_by: null,
    created_at: "",
    updated_at: "",
  };
}

describe("jaccardSimilarity (Korean tokens via whitespace)", () => {
  it("identical strings → 1", () => {
    expect(jaccardSimilarity("외식 좋아함", "외식 좋아함")).toBe(1);
  });

  it("disjoint → 0", () => {
    expect(jaccardSimilarity("외식 좋아함", "운동 싫어함")).toBe(0);
  });

  it("partial overlap returns intersection / union", () => {
    // ["외식","좋아함"] vs ["외식","스트레스","많을때"] → 1/4
    expect(jaccardSimilarity("외식 좋아함", "외식 스트레스 많을때")).toBeCloseTo(1 / 4);
  });

  it("returns 0 for empty inputs", () => {
    expect(jaccardSimilarity("", "외식")).toBe(0);
    expect(jaccardSimilarity("", "")).toBe(0);
  });
});

describe("findConflictCandidates", () => {
  const active: ProfileRow[] = [
    row("a", "preference", "외식 좋아함"),
    row("b", "preference", "운동 싫어함"),
    row("c", "tone", "회고 시작 톤은 늘 피곤함"),
  ];

  it("matches same kind when similarity >= threshold", () => {
    const newRow = row("new", "preference", "외식 좋아함 그치만 도파민 소비도");
    // active 'a' tokens: ["외식","좋아함"]
    // new tokens: ["외식","좋아함","그치만","도파민","소비도"]
    // intersection 2, union 5 → similarity 0.4 (above the 0.3 threshold passed below)
    const matches = findConflictCandidates(newRow, active, 0.3);
    expect(matches.map((m) => m.id)).toEqual(["a"]);
  });

  it("ignores rows of other kinds even on textual overlap", () => {
    const newRow = row("new", "tone", "외식 좋아함");
    const matches = findConflictCandidates(newRow, active, 0.3);
    // 'a' is preference — excluded; 'c' is tone — no overlap
    expect(matches).toHaveLength(0);
  });
});
