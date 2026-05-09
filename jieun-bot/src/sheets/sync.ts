import { db } from "../db/client.js";
import { sheets, SHEET } from "./client.js";
import { getIndexMap, recordSheetSyncBulk } from "../db/sheetsSyncMap.js";
import { ensureTab } from "./setup.js";

const TABLE = "budget_entries";
const TYPE_KO: Record<string, string> = {
  expense: "지출",
  income: "수입",
  saving: "저축",
};

type BudgetRow = {
  id: string;
  date: string;
  category: string | null;
  amount: number;
  type: string;
  memo: string | null;
  payment_method: string | null;
};

type Cell = string | number;

// USER_ENTERED 모드에서 셀 값이 =, +, -, @ 로 시작하면 수식으로 평가됨.
// 외부 입력(메모/결제수단)에 이런 prefix가 오면 ' 로 escape.
function escapeFormula(s: string): string {
  if (s.length === 0) return s;
  const first = s[0];
  if (first === "=" || first === "+" || first === "-" || first === "@") {
    return "'" + s;
  }
  return s;
}

function rowToCells(r: BudgetRow): Cell[] {
  return [
    r.date, // ISO date string — USER_ENTERED 모드에서 Sheets가 날짜로 파싱
    escapeFormula(r.category ?? ""),
    r.amount,
    TYPE_KO[r.type] ?? r.type, // Korean enum 고정값 — formula 위험 없음
    escapeFormula(r.memo ?? ""),
    escapeFormula(r.payment_method ?? ""),
  ];
}

// 헤더 누락/불일치면 1행에 박음.
async function ensureHeaders(tab: string): Promise<void> {
  const sheetsClient = sheets();
  const spreadsheetId = SHEET.budget.spreadsheetId();
  const expected = SHEET.budget.headers;

  const got = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tab}'!A1:F1`,
  });
  const current = got.data.values?.[0] ?? [];
  const matches = expected.every((h, i) => current[i] === h);
  if (matches) return;

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tab}'!A1:F1`,
    valueInputOption: "RAW",
    requestBody: { values: [expected.slice()] },
  });
}

// budget_entries → 데이터 탭 단방향. DB가 진실원.
// 멱등: sheets_sync_map의 (source_table, source_row_id)로 sheet_row_index 추적.
// sheet_tab 컬럼으로 다중 탭 sync 대비 (현재는 데이터 탭만).
//
// 알려진 한계: 사용자가 시트에서 행을 수동 삭제/재정렬하면 row_index가 어긋남.
// 데이터 탭은 read-only로 보고 손대지 말 것.
export async function syncBudgetEntries(): Promise<{ inserted: number; updated: number }> {
  const tab = SHEET.budget.dataTab;
  const spreadsheetId = SHEET.budget.spreadsheetId();

  await ensureTab(spreadsheetId, tab);
  await ensureHeaders(tab);

  const { data: entries, error } = await db()
    .from(TABLE)
    .select("id, date, category, amount, type, memo, payment_method")
    .order("date", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  if (!entries || entries.length === 0) return { inserted: 0, updated: 0 };

  const rows = entries as BudgetRow[];
  const indexById = await getIndexMap(TABLE, tab, rows.map((r) => r.id));

  const toAppend: { id: string; cells: Cell[] }[] = [];
  const toUpdate: { rowIndex: number; cells: Cell[] }[] = [];
  for (const r of rows) {
    const cells = rowToCells(r);
    const idx = indexById.get(r.id);
    if (idx) toUpdate.push({ rowIndex: idx, cells });
    else toAppend.push({ id: r.id, cells });
  }

  const sheetsClient = sheets();

  if (toUpdate.length > 0) {
    await sheetsClient.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        // USER_ENTERED — 날짜 문자열을 실제 Date로 파싱시켜 SUMIFS 비교가 동작.
        // formula injection은 escapeFormula로 방어 (rowToCells).
        valueInputOption: "USER_ENTERED",
        data: toUpdate.map((u) => ({
          range: `'${tab}'!A${u.rowIndex}:F${u.rowIndex}`,
          values: [u.cells.map(String)],
        })),
      },
    });
  }

  if (toAppend.length > 0) {
    const appendRes = await sheetsClient.spreadsheets.values.append({
      spreadsheetId,
      range: `'${tab}'!A:F`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: toAppend.map((a) => a.cells.map(String)) },
    });
    const updatedRange = appendRes.data.updates?.updatedRange ?? "";
    // updatedRange 예: "'데이터'!A45:F50"
    const m = /![A-Z]+(\d+):[A-Z]+\d+$/.exec(updatedRange);
    if (!m) {
      throw new Error(`append: cannot parse updatedRange "${updatedRange}"`);
    }
    const startRow = Number(m[1]);
    await recordSheetSyncBulk(
      toAppend.map((a, i) => ({
        source_table: TABLE,
        sheet_tab: tab,
        source_row_id: a.id,
        sheet_row_index: startRow + i,
      }))
    );
  }

  return { inserted: toAppend.length, updated: toUpdate.length };
}
