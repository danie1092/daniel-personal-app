import { describe, it, expect } from "vitest";
import { isInSilenceWindow } from "./silenceWindow.js";

describe("isInSilenceWindow", () => {
  it("returns true at midnight KST (15:00 UTC)", () => {
    const d = new Date("2026-04-30T15:00:00Z");
    expect(isInSilenceWindow(d)).toBe(true);
  });

  it("returns true at 03:00 KST (18:00 UTC prev day)", () => {
    const d = new Date("2026-04-29T18:00:00Z");
    expect(isInSilenceWindow(d)).toBe(true);
  });

  it("returns true at 07:59 KST (22:59 UTC prev day)", () => {
    const d = new Date("2026-04-29T22:59:00Z");
    expect(isInSilenceWindow(d)).toBe(true);
  });

  it("returns false at 08:00 KST (23:00 UTC prev day)", () => {
    const d = new Date("2026-04-29T23:00:00Z");
    expect(isInSilenceWindow(d)).toBe(false);
  });

  it("returns false at 12:30 KST (03:30 UTC same day)", () => {
    const d = new Date("2026-04-30T03:30:00Z");
    expect(isInSilenceWindow(d)).toBe(false);
  });

  it("returns false at 23:00 KST (14:00 UTC same day)", () => {
    const d = new Date("2026-04-30T14:00:00Z");
    expect(isInSilenceWindow(d)).toBe(false);
  });
});
