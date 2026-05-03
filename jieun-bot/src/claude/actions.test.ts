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

describe("calendar action parsing", () => {
  it("parses propose_calendar_event", () => {
    const text = `<actions>[{"kind":"propose_calendar_event","title":"ABC","start":"2026-05-04T15:00:00+09:00","end":"2026-05-04T16:00:00+09:00"}]</actions>`;
    const r = parseActions(text);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]?.kind).toBe("propose_calendar_event");
  });

  it("parses confirm_calendar_action", () => {
    const text = `오케이<actions>[{"kind":"confirm_calendar_action"}]</actions>`;
    const r = parseActions(text);
    expect(r.actions).toHaveLength(1);
    expect(r.cleanText).toBe("오케이");
  });

  it("parses propose_calendar_delete", () => {
    const text = `<actions>[{"kind":"propose_calendar_delete","targetUid":"UID-X","display":"내일 15:00 ABC"}]</actions>`;
    const r = parseActions(text);
    expect(r.actions).toHaveLength(1);
    if (r.actions[0]?.kind === "propose_calendar_delete") {
      expect(r.actions[0].targetUid).toBe("UID-X");
    }
  });

  it("rejects propose_calendar_event with empty title", () => {
    const text = `<actions>[{"kind":"propose_calendar_event","title":"","start":"2026-05-04T15:00:00+09:00","end":"2026-05-04T16:00:00+09:00"}]</actions>`;
    const r = parseActions(text);
    expect(r.actions).toHaveLength(0);
  });
});
