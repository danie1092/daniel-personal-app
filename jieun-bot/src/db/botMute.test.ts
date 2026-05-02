import { describe, it, expect, afterEach } from "vitest";
import { db } from "./client.js";
import { isMuted, muteFor, cancelMute } from "./botMute.js";

describe("botMute", () => {
  afterEach(async () => {
    await db().from("bot_mute_state").update({ silent_until: null }).eq("id", 1);
  });

  it("isMuted returns false when silent_until is NULL", async () => {
    await cancelMute();
    expect(await isMuted()).toBe(false);
  });

  it("muteFor sets silent_until to now+hours, isMuted returns true", async () => {
    await muteFor(1);
    expect(await isMuted()).toBe(true);
  });

  it("isMuted returns false when silent_until is in the past", async () => {
    await db().from("bot_mute_state").update({
      silent_until: new Date(Date.now() - 60_000).toISOString(),
    }).eq("id", 1);
    expect(await isMuted()).toBe(false);
  });

  it("cancelMute clears silent_until", async () => {
    await muteFor(1);
    await cancelMute();
    expect(await isMuted()).toBe(false);
  });
});
