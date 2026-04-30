import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompt.js";

describe("buildSystemPrompt", () => {
  it("includes core 5 tone rules", () => {
    const p = buildSystemPrompt({
      trigger: "user",
      now: new Date("2026-04-30T12:30:00+09:00"),
      memorySection: "",
      profileSection: "",
      contextSection: "",
    });
    expect(p).toMatch(/이지은/);
    expect(p).toMatch(/다영/);
    expect(p).toMatch(/일반 발화: 5문장 이내/);
    expect(p).toMatch(/회고 대화: 10문장 이내/);
    expect(p).toMatch(/판단 X.*관찰 O/s);
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
