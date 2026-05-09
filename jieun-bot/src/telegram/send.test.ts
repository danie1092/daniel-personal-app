import { describe, it, expect } from "vitest";
import { getChunkCap, stripLeadingOh, type ScheduleKind } from "./send.js";

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

describe("stripLeadingOh", () => {
  it("strips '오~ ' prefix", () => {
    expect(stripLeadingOh("오~ 다영아 점심 먹었어?")).toBe("다영아 점심 먹었어?");
  });

  it("strips '오 ' prefix (just space)", () => {
    expect(stripLeadingOh("오 다영아")).toBe("다영아");
  });

  it("strips '오, ' prefix", () => {
    expect(stripLeadingOh("오, 그렇구나")).toBe("그렇구나");
  });

  it("strips '오~~~ ' (multiple tildes)", () => {
    expect(stripLeadingOh("오~~~ 진짜?")).toBe("진짜?");
  });

  it("strips '오! ' prefix", () => {
    expect(stripLeadingOh("오! 그게 그렇네")).toBe("그게 그렇네");
  });

  it("strips '오... ' prefix", () => {
    expect(stripLeadingOh("오... 잠깐만")).toBe("잠깐만");
  });

  it("preserves '오늘' (Korean word starting with 오)", () => {
    expect(stripLeadingOh("오늘 뭐했어?")).toBe("오늘 뭐했어?");
  });

  it("preserves '오빠' (another Korean word)", () => {
    expect(stripLeadingOh("오빠 어디야")).toBe("오빠 어디야");
  });

  it("preserves '오케이'", () => {
    expect(stripLeadingOh("오케이 그렇게 하자")).toBe("오케이 그렇게 하자");
  });

  it("preserves '오랜만' / '오히려' / generic 오 + 한글", () => {
    expect(stripLeadingOh("오랜만이네")).toBe("오랜만이네");
    expect(stripLeadingOh("오히려 좋아")).toBe("오히려 좋아");
  });

  it("does not strip mid-message 오~", () => {
    expect(stripLeadingOh("그래서 오~ 그랬구나")).toBe("그래서 오~ 그랬구나");
  });

  it("returns input unchanged when no leading 오", () => {
    expect(stripLeadingOh("그치 ㅎㅎ")).toBe("그치 ㅎㅎ");
    expect(stripLeadingOh("")).toBe("");
  });
});
