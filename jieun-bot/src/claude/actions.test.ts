import { describe, it, expect } from "vitest";
import { parseActions } from "./actions.js";

describe("parseActions", () => {
  it("returns clean text and parsed actions when block present", () => {
    const input = `등록할게!\n<actions>\n[{"kind":"propose_calendar_event","title":"ABC","start":"2026-05-04T15:00:00+09:00","end":"2026-05-04T16:00:00+09:00"}]\n</actions>`;
    const r = parseActions(input);
    expect(r.cleanText).toBe("등록할게!");
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]).toMatchObject({
      kind: "propose_calendar_event",
      title: "ABC",
    });
  });

  it("returns empty actions when no block", () => {
    const r = parseActions("그냥 평범한 답변이야.");
    expect(r.cleanText).toBe("그냥 평범한 답변이야.");
    expect(r.actions).toEqual([]);
  });

  it("skips invalid items but keeps valid ones", () => {
    const input = `text\n<actions>\n[{"kind":"unknown"},{"kind":"confirm_calendar_action"}]\n</actions>`;
    const r = parseActions(input);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]?.kind).toBe("confirm_calendar_action");
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
    const input = `첫째 단락.\n<actions>\n[{"kind":"propose_calendar_event","title":"A","start":"2026-05-04T15:00:00+09:00","end":"2026-05-04T16:00:00+09:00"}]\n</actions>\n둘째 단락.\n<actions>\n[{"kind":"confirm_calendar_action"}]\n</actions>`;
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

  it("accepts single object inside <actions> (no array wrap)", () => {
    // 라이브 재현: Claude가 1-액션 케이스에서 array wrap을 자주 누락.
    // {"kind":"..."} 단일 object도 [{"kind":"..."}]처럼 처리.
    const text = `오케이<actions>{"kind":"propose_calendar_event","title":"운동","start":"2026-05-09T16:00:00+09:00","end":"2026-05-09T17:00:00+09:00"}</actions>`;
    const r = parseActions(text);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]?.kind).toBe("propose_calendar_event");
    expect(r.parseError).toBeUndefined();
  });
});
