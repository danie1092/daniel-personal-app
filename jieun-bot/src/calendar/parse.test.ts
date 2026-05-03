import { describe, it, expect } from "vitest";
import { validateProposeEvent } from "./parse.js";

describe("calendar/parse.ts validateProposeEvent", () => {
  it("accepts valid ISO with KST offset", () => {
    const r = validateProposeEvent({
      title: "ABC",
      start: "2026-05-04T15:00:00+09:00",
      end: "2026-05-04T16:00:00+09:00",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects empty title", () => {
    const r = validateProposeEvent({
      title: "",
      start: "2026-05-04T15:00:00+09:00",
      end: "2026-05-04T16:00:00+09:00",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/title/);
  });

  it("rejects end before start", () => {
    const r = validateProposeEvent({
      title: "X",
      start: "2026-05-04T16:00:00+09:00",
      end: "2026-05-04T15:00:00+09:00",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/end/);
  });

  it("rejects too far in past (more than 1 day ago)", () => {
    const oldStart = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    const oldEnd = new Date(Date.now() - 2 * 86400 * 1000 + 3600 * 1000).toISOString();
    const r = validateProposeEvent({ title: "X", start: oldStart, end: oldEnd });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/past/);
  });

  it("rejects too far in future (more than 1 year)", () => {
    const farStart = new Date(Date.now() + 400 * 86400 * 1000).toISOString();
    const farEnd = new Date(Date.now() + 400 * 86400 * 1000 + 3600 * 1000).toISOString();
    const r = validateProposeEvent({ title: "X", start: farStart, end: farEnd });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/future/);
  });

  it("rejects malformed ISO", () => {
    const r = validateProposeEvent({ title: "X", start: "not-a-date", end: "also-bad" });
    expect(r.ok).toBe(false);
  });
});
