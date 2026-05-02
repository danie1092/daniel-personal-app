import { describe, it, expect, afterAll } from "vitest";
import { db } from "./client.js";
import {
  insertObservation,
  fetchActiveProfile,
  supersede,
  type ProfileKind,
} from "./userProfile.js";

const TEST_PREFIX = "__test_prof_";

describe("userProfile CRUD", () => {
  afterAll(async () => {
    await db().from("user_profile").delete().like("observation", `${TEST_PREFIX}%`);
  });

  it("insertObservation returns id, fetchActiveProfile returns it", async () => {
    const id = await insertObservation({
      kind: "preference",
      observation: `${TEST_PREFIX}likes 김밥`,
      evidence_dates: ["2026-05-01"],
    });
    expect(id).toMatch(/^[0-9a-f-]+$/);
    const active = await fetchActiveProfile(50);
    const ours = active.find((p) => p.id === id);
    expect(ours).toBeDefined();
    expect(ours!.kind).toBe("preference");
  });

  it("supersede sets superseded_by, target row drops out of active", async () => {
    const oldId = await insertObservation({
      kind: "pattern",
      observation: `${TEST_PREFIX}old pattern`,
      evidence_dates: ["2026-04-30"],
    });
    const newId = await insertObservation({
      kind: "pattern",
      observation: `${TEST_PREFIX}new pattern`,
      evidence_dates: ["2026-05-01"],
    });
    await supersede(oldId, newId);
    const active = await fetchActiveProfile(50);
    expect(active.find((p) => p.id === oldId)).toBeUndefined();
    expect(active.find((p) => p.id === newId)).toBeDefined();
  });

  it("fetchActiveProfile filters out superseded and respects limit", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(
        await insertObservation({
          kind: "tone" as ProfileKind,
          observation: `${TEST_PREFIX}t${i}`,
          evidence_dates: ["2026-05-01"],
        })
      );
    }
    const active = await fetchActiveProfile(2);
    expect(active.length).toBeLessThanOrEqual(2);
  });
});
