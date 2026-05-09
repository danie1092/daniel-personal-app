import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildContextPrefix } from "./prompt.js";

describe("buildSystemPrompt — stable per-trigger (cache prefix)", () => {
  it("includes core persona rules", () => {
    const p = buildSystemPrompt({ trigger: "user" });
    expect(p).toMatch(/이지은/);
    expect(p).toMatch(/다영/);
    expect(p).toMatch(/너는 챗봇이 아니다/);
  });

  it("embeds trigger label", () => {
    const p = buildSystemPrompt({ trigger: "latent" });
    expect(p).toMatch(/트리거: latent/);
  });

  it("does NOT include time/memory/profile sections (those are in contextPrefix)", () => {
    const p = buildSystemPrompt({ trigger: "user" });
    expect(p).not.toContain("[지금]");
    expect(p).not.toContain("[메모리]");
    expect(p).not.toContain("[다영에 대해 알게 된 것]");
    // 주의: CALENDAR_RULES 본문에 "[현재 컨텍스트]에 박힌 후보..."처럼
    // 섹션 *참조* 문구가 있어서 string match로는 못 거름. 변동값이 안 들어
    // 갔는지는 "지금/메모리/profile 섹션 헤더 부재"로 충분히 확인됨.
  });

  it("byte-stable across calls of same trigger (cache prefix invariant)", () => {
    const a = buildSystemPrompt({ trigger: "user" });
    const b = buildSystemPrompt({ trigger: "user" });
    expect(a).toBe(b);
  });

  it("differs across triggers (separate cache entries)", () => {
    const u = buildSystemPrompt({ trigger: "user" });
    const s = buildSystemPrompt({ trigger: "schedule" });
    expect(u).not.toBe(s);
  });
});

describe("buildSystemPrompt — retro section", () => {
  it("includes retro section when scheduleKind=retro", () => {
    const prompt = buildSystemPrompt({ trigger: "schedule", scheduleKind: "retro" });
    expect(prompt).toContain("[지금 회고 시간]");
    expect(prompt).toContain("좋았던 점");
  });

  it("omits retro section for non-retro schedule", () => {
    const prompt = buildSystemPrompt({ trigger: "schedule", scheduleKind: "morning" });
    expect(prompt).not.toContain("[지금 회고 시간]");
  });

  it("omits retro section for non-schedule triggers", () => {
    expect(buildSystemPrompt({ trigger: "user" })).not.toContain("[지금 회고 시간]");
  });
});

describe("buildSystemPrompt — calendar rules", () => {
  it("includes calendar rules on user trigger", () => {
    const prompt = buildSystemPrompt({ trigger: "user" });
    expect(prompt).toContain("propose_calendar_event");
    expect(prompt).toContain("user 트리거에서만");
  });

  it("excludes calendar rules on schedule/event/latent triggers", () => {
    expect(buildSystemPrompt({ trigger: "schedule", scheduleKind: "morning" })).not.toContain("propose_calendar_event");
    expect(buildSystemPrompt({ trigger: "event" })).not.toContain("propose_calendar_event");
    expect(buildSystemPrompt({ trigger: "latent" })).not.toContain("propose_calendar_event");
  });
});

describe("buildContextPrefix — volatile content", () => {
  const base = {
    trigger: "user" as const,
    now: new Date("2026-05-03T10:00:00+09:00"),
    memorySection: "",
    profileSection: "",
    contextSection: "",
  };

  it("includes [지금] section with KST timestamp", () => {
    const prefix = buildContextPrefix(base);
    expect(prefix).toContain("[지금]");
    expect(prefix).toMatch(/2026/);
    expect(prefix).toMatch(/어제 =/);
    expect(prefix).toMatch(/내일 =/);
  });

  it("omits profile section when empty", () => {
    const prefix = buildContextPrefix(base);
    expect(prefix).not.toContain("[다영에 대해 알게 된 것]");
  });

  it("includes profile section when present", () => {
    const prefix = buildContextPrefix({
      ...base,
      profileSection: "- (preference) 김밥 좋아함",
    });
    expect(prefix).toContain("[다영에 대해 알게 된 것]");
    expect(prefix).toContain("(preference) 김밥 좋아함");
  });

  it("places profile section before [지금]", () => {
    const prefix = buildContextPrefix({
      ...base,
      profileSection: "- (pattern) X",
    });
    const profileIdx = prefix.indexOf("[다영에 대해 알게 된 것]");
    const nowIdx = prefix.indexOf("[지금]");
    expect(profileIdx).toBeGreaterThan(-1);
    expect(nowIdx).toBeGreaterThan(profileIdx);
  });

  it("omits memory/context sections when empty", () => {
    const prefix = buildContextPrefix(base);
    expect(prefix).not.toContain("[메모리]");
    expect(prefix).not.toContain("[현재 컨텍스트]");
  });

  it("includes memory/context when present", () => {
    const prefix = buildContextPrefix({
      ...base,
      memorySection: "최근 대화 — 어제 ABC",
      contextSection: "활성 시그널: 1건",
    });
    expect(prefix).toContain("[메모리]");
    expect(prefix).toContain("어제 ABC");
    expect(prefix).toContain("[현재 컨텍스트]");
    expect(prefix).toContain("활성 시그널");
  });
});
