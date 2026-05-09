import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../env.js", () => ({
  loadEnv: () => ({
    LOG_DIR: "/tmp",
    SUPABASE_URL: "http://test",
    SUPABASE_SERVICE_ROLE_KEY: "test-key",
  }),
}));

const selectMock = vi.fn();
const upsertMock = vi.fn();
const fromMock = vi.fn();

vi.mock("./client.js", () => ({
  db: () => ({ from: fromMock }),
}));

import { getIndexMap, recordSheetSyncBulk } from "./sheetsSyncMap.js";

beforeEach(() => {
  selectMock.mockReset();
  upsertMock.mockReset();
  fromMock.mockReset();

  fromMock.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ in: selectMock }),
      }),
    }),
    upsert: upsertMock,
  }));
});

describe("getIndexMap with sheet_tab", () => {
  it("filters by both source_table and sheet_tab", async () => {
    selectMock.mockResolvedValue({
      data: [
        { source_row_id: "id-1", sheet_row_index: 5 },
        { source_row_id: "id-2", sheet_row_index: 9 },
      ],
      error: null,
    });

    const result = await getIndexMap("budget_entries", "데이터", ["id-1", "id-2"]);

    expect(fromMock).toHaveBeenCalledWith("sheets_sync_map");
    expect(result.get("id-1")).toBe(5);
    expect(result.get("id-2")).toBe(9);
  });

  it("returns empty map when no source_row_ids", async () => {
    const result = await getIndexMap("budget_entries", "데이터", []);
    expect(result.size).toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("throws on db error", async () => {
    selectMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(
      getIndexMap("budget_entries", "데이터", ["id-1"])
    ).rejects.toMatchObject({ message: "boom" });
  });
});

describe("recordSheetSyncBulk with sheet_tab", () => {
  it("includes sheet_tab in upsert rows", async () => {
    upsertMock.mockResolvedValue({ error: null });

    await recordSheetSyncBulk([
      { source_table: "budget_entries", source_row_id: "id-1", sheet_tab: "데이터", sheet_row_index: 5 },
      { source_table: "budget_entries", source_row_id: "id-2", sheet_tab: "데이터", sheet_row_index: 6 },
    ]);

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const arg = upsertMock.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(arg).toHaveLength(2);
    expect(arg[0]).toMatchObject({ source_table: "budget_entries", sheet_tab: "데이터", sheet_row_index: 5 });
    expect(arg[1]).toMatchObject({ source_row_id: "id-2", sheet_tab: "데이터", sheet_row_index: 6 });
  });

  it("no-ops on empty input", async () => {
    await recordSheetSyncBulk([]);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
