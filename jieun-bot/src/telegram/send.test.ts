import { describe, it, expect } from "vitest";
import { getChunkCap, type ScheduleKind } from "./send.js";

describe("getChunkCap", () => {
  it("retro schedule → 3", () => {
    expect(getChunkCap("schedule", "retro")).toBe(3);
  });

  it("non-retro schedule → 1", () => {
    const kinds: ScheduleKind[] = ["morning", "lunch", "evening_brief", "end_of_day", "daily_summary", "weekly_summary"];
    for (const k of kinds) expect(getChunkCap("schedule", k)).toBe(1);
  });

  it("event/user/latent/system → 1", () => {
    expect(getChunkCap("event")).toBe(1);
    expect(getChunkCap("user")).toBe(1);
    expect(getChunkCap("latent")).toBe(1);
    expect(getChunkCap("system")).toBe(1);
  });

  it("schedule with no kind → 1 (defensive)", () => {
    expect(getChunkCap("schedule")).toBe(1);
  });
});
