import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompt.js";

describe("buildSystemPrompt", () => {
  it("includes core persona rules", () => {
    const p = buildSystemPrompt({
      trigger: "user",
      now: new Date("2026-04-30T12:30:00+09:00"),
      memorySection: "",
      profileSection: "",
      contextSection: "",
    });
    expect(p).toMatch(/이지은/);
    expect(p).toMatch(/다영/);
    expect(p).toMatch(/일반 5문장 이내/);
    expect(p).toMatch(/회고\(23:00\) 10/);
    expect(p).toMatch(/너는 챗봇이 아니다/);
    expect(p).toMatch(/같이 느끼/);
  });

  it("embeds trigger label", () => {
    const p = buildSystemPrompt({
      trigger: "latent",
      now: new Date("2026-04-30T16:00:00+09:00"),
      memorySection: "",
      profileSection: "",
      contextSection: "",
    });
    expect(p).toMatch(/트리거: latent/);
  });
});

describe("buildSystemPrompt — profile section", () => {
  it("omits profile section when empty", () => {
    const prompt = buildSystemPrompt({
      trigger: "user",
      now: new Date("2026-05-03T10:00:00+09:00"),
      memorySection: "",
      profileSection: "",
      contextSection: "",
    });
    expect(prompt).not.toContain("[다영에 대해 알게 된 것]");
  });

  it("includes profile section when present", () => {
    const prompt = buildSystemPrompt({
      trigger: "user",
      now: new Date("2026-05-03T10:00:00+09:00"),
      memorySection: "",
      profileSection: "- (preference) 김밥 좋아함\n- (tone) 회고 시작 톤은 늘 피곤함",
      contextSection: "",
    });
    expect(prompt).toContain("[다영에 대해 알게 된 것]");
    expect(prompt).toContain("(preference) 김밥 좋아함");
    expect(prompt).toContain("(tone) 회고 시작 톤은 늘 피곤함");
  });

  it("places profile section before [지금]", () => {
    const prompt = buildSystemPrompt({
      trigger: "user",
      now: new Date("2026-05-03T10:00:00+09:00"),
      memorySection: "",
      profileSection: "- (pattern) X",
      contextSection: "",
    });
    const profileIdx = prompt.indexOf("[다영에 대해 알게 된 것]");
    const nowIdx = prompt.indexOf("[지금]");
    expect(profileIdx).toBeGreaterThan(-1);
    expect(nowIdx).toBeGreaterThan(profileIdx);
  });
});

describe("buildSystemPrompt — retro section", () => {
  it("includes retro section when scheduleKind=retro", () => {
    const prompt = buildSystemPrompt({
      trigger: "schedule",
      scheduleKind: "retro",
      now: new Date("2026-05-03T23:00:00+09:00"),
      memorySection: "",
      profileSection: "",
      contextSection: "",
    });
    expect(prompt).toContain("[지금 회고 시간]");
    expect(prompt).toContain("좋았던 점");
  });

  it("omits retro section for non-retro schedule", () => {
    const prompt = buildSystemPrompt({
      trigger: "schedule",
      scheduleKind: "morning",
      now: new Date("2026-05-03T08:00:00+09:00"),
      memorySection: "",
      profileSection: "",
      contextSection: "",
    });
    expect(prompt).not.toContain("[지금 회고 시간]");
  });

  it("omits retro section for non-schedule triggers", () => {
    const prompt = buildSystemPrompt({
      trigger: "user",
      now: new Date("2026-05-03T23:00:00+09:00"),
      memorySection: "",
      profileSection: "",
      contextSection: "",
    });
    expect(prompt).not.toContain("[지금 회고 시간]");
  });
});
