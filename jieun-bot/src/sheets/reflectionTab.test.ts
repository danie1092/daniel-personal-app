import { describe, it, expect } from "vitest";
import { reflectionRows, reflectionHeader } from "./reflectionTab.js";

describe("reflectionHeader", () => {
  it("returns 5 column header", () => {
    expect(reflectionHeader()).toEqual(["월", "예산", "잘한 점", "반성한 점", "주요 이벤트"]);
  });
});

describe("reflectionRows", () => {
  it("creates 12 month rows for the given year, with default budget", () => {
    const rows = reflectionRows(2026, 2200000);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual(["2026-01-01", 2200000, "", "", ""]);
    expect(rows[11]).toEqual(["2026-12-01", 2200000, "", "", ""]);
  });

  it("default budget defaults to 0 when not provided", () => {
    const rows = reflectionRows(2027);
    expect(rows[0]?.[1]).toBe(0);
  });
});
