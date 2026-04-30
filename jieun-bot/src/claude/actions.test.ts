import { describe, it, expect } from "vitest";
import { parseActions } from "./actions.js";

describe("parseActions", () => {
  it("returns clean text and parsed actions when block present", () => {
    const input = `김밥 잘 먹었네!\n<actions>\n[{"kind":"budget_insert","amount":7000,"category":"식비","memo":"김밥","type":"expense","date_offset":0}]\n</actions>`;
    const r = parseActions(input);
    expect(r.cleanText).toBe("김밥 잘 먹었네!");
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]).toMatchObject({
      kind: "budget_insert",
      amount: 7000,
      category: "식비",
      memo: "김밥",
      type: "expense",
    });
  });

  it("returns empty actions when no block", () => {
    const r = parseActions("그냥 평범한 답변이야.");
    expect(r.cleanText).toBe("그냥 평범한 답변이야.");
    expect(r.actions).toEqual([]);
  });

  it("skips invalid items but keeps valid ones", () => {
    const input = `text\n<actions>\n[{"kind":"unknown"},{"kind":"budget_insert","amount":7000,"category":"식비","memo":"x","type":"expense","date_offset":0}]\n</actions>`;
    const r = parseActions(input);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]?.kind).toBe("budget_insert");
  });

  it("returns parseError on malformed JSON", () => {
    const r = parseActions(`text\n<actions>\nnot json\n</actions>`);
    expect(r.parseError).toBeDefined();
    expect(r.cleanText).toBe("text");
    expect(r.actions).toEqual([]);
  });

  it("preserves multiline cleanText", () => {
    const input = `첫 단락.\n\n둘째 단락.\n<actions>\n[]\n</actions>`;
    const r = parseActions(input);
    expect(r.cleanText).toContain("첫 단락");
    expect(r.cleanText).toContain("둘째 단락");
  });

  it("parses multiple <actions> blocks in one response", () => {
    const input = `첫째 단락.\n<actions>\n[{"kind":"budget_insert","amount":3000,"category":"식비","memo":"커피","type":"expense","date_offset":0}]\n</actions>\n둘째 단락.\n<actions>\n[{"kind":"budget_insert","amount":7000,"category":"식비","memo":"김밥","type":"expense","date_offset":0}]\n</actions>`;
    const r = parseActions(input);
    expect(r.actions).toHaveLength(2);
    expect(r.cleanText).toBe("첫째 단락.\n\n둘째 단락.");
    expect(r.cleanText).not.toContain("<actions>");
  });
});
