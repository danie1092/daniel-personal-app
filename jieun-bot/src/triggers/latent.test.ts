import { describe, it, expect, vi, beforeEach } from "vitest";
import { runLatentObservation } from "./latent.js";
import type { ClaudeAdapter, ClaudeCallInput, ClaudeCallResult } from "../claude/adapter.js";

class MockClaude implements ClaudeAdapter {
  constructor(public response: string) {}
  calls = 0;
  async ask(_: ClaudeCallInput): Promise<ClaudeCallResult> {
    this.calls++;
    return { text: this.response, durationMs: 0 };
  }
}

vi.mock("../telegram/send.js", () => ({
  sendToOwner: vi.fn().mockResolvedValue(undefined),
  getChunkCap: vi.fn(() => 1),
}));

vi.mock("../signals/compute.js", () => ({
  computeSignals: vi.fn().mockResolvedValue([]),
}));

vi.mock("../db/botSignals.js", () => ({
  recordCandidate: vi.fn().mockResolvedValue("test-id"),
  markFired: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../memory/load.js", () => ({
  loadMemorySection: vi.fn().mockResolvedValue(""),
  getProfileSection: vi.fn().mockResolvedValue(""),
}));

vi.mock("./silenceWindow.js", () => ({
  isInSilenceWindow: vi.fn(() => false),
}));

describe("runLatentObservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("silence window: returns without calling Claude", async () => {
    const { isInSilenceWindow } = await import("./silenceWindow.js");
    vi.mocked(isInSilenceWindow).mockReturnValueOnce(true);
    const claude = new MockClaude("");
    await runLatentObservation(claude);
    expect(claude.calls).toBe(0);
  });

  it("speak=false: does not call sendToOwner", async () => {
    const { sendToOwner } = await import("../telegram/send.js");
    const claude = new MockClaude(JSON.stringify({ speak: false, reason: "별일 없음" }));
    await runLatentObservation(claude);
    expect(claude.calls).toBe(1);
    expect(sendToOwner).not.toHaveBeenCalled();
  });

  it("speak=true with message: calls sendToOwner with latent trigger", async () => {
    const { sendToOwner } = await import("../telegram/send.js");
    const claude = new MockClaude(JSON.stringify({
      speak: true,
      reason: "test",
      message: "테스트 메시지",
    }));
    await runLatentObservation(claude);
    expect(sendToOwner).toHaveBeenCalledWith("테스트 메시지", "latent");
  });

  it("malformed JSON: silent skip", async () => {
    const { sendToOwner } = await import("../telegram/send.js");
    const claude = new MockClaude("not json");
    await runLatentObservation(claude);
    expect(sendToOwner).not.toHaveBeenCalled();
  });
});
