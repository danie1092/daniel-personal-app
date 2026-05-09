import type { sheets_v4 } from "googleapis";
import { sheets, SHEET } from "./client.js";
import { ensureTab, getTabIdMap } from "./setup.js";
import { reflectionHeader, reflectionRows } from "./reflectionTab.js";
import {
  typeSumFormula,
  categorySumFormula,
  paymentMethodSumFormula,
  reflectionLookupFormula,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
} from "./dashboard.js";

// 토스 색감.
const COLOR = {
  card: { red: 1, green: 1, blue: 1 },
  text: { red: 0.098, green: 0.122, blue: 0.157 },
  sub: { red: 0.545, green: 0.584, blue: 0.631 },
  blue: { red: 0.192, green: 0.510, blue: 0.965 },
  red: { red: 0.941, green: 0.267, blue: 0.322 },
  green: { red: 0, green: 0.722, blue: 0.584 },
} as const;

const MONTH_CELL = "A2";
const DEFAULT_BUDGET = 2200000;
const YEAR = new Date().getFullYear();

// 새 레이아웃 (1-indexed cell 좌표):
//   Row 1: A1 "다니의 가계부" (title, large)         | D1 "이번 달 가용 금액" (label, sub)
//   Row 2: A2 month dropdown (date)                  | D2:F2 merged: hero number (huge blue)
//   Row 3: (spacer)
//   Row 4:                                              D4 "예산" | E4 "지출" | F4 "사용률" (labels)
//   Row 5:                                              D5 budget | E5 expense | F5 usage%
//   Row 6: (spacer)
//   Row 7: A7 "지출" | B7 "수입" | C7 "저축" (labels)
//   Row 8: A8 expense | B8 income | C8 saving (large currency, colored)
//   Row 9: (spacer)
//   Row 10: A10 "카테고리" (header)                   | D10 "결제수단" (header)
//   Rows 11-23: A:B 13 expense categories             | D:E rows 11-15: 5 payment methods
//                                                     | D16: (spacer)
//                                                     | D17: "급여 · 카드 사용 현황" (header)
//                                                     | D:E rows 18-21: 월급 + 3 카드
//   Row 24: A24 "이번 달 회고" (header)
//   Row 25: A25 "잘한 점" | B25 "반성한 점" | C25 "주요 이벤트" (labels)
//   Row 26: A26:F26 reflection values (3 cells, wrap text)
//   Charts on column H (idx 7): cat chart anchor row 10, pm chart anchor row 22.

export async function runSetupDashboard(): Promise<void> {
  const spreadsheetId = SHEET.budget.spreadsheetId();
  const sheetsClient = sheets();

  await ensureTab(spreadsheetId, SHEET.budget.dataTab);
  await ensureTab(spreadsheetId, SHEET.budget.reflectionTab);
  await ensureTab(spreadsheetId, SHEET.budget.dashboardTab);

  const tabIds = await getTabIdMap(spreadsheetId);
  const reflectionId = mustGet(tabIds, SHEET.budget.reflectionTab);
  const dashboardId = mustGet(tabIds, SHEET.budget.dashboardTab);

  await maybeSeedReflectionTab(spreadsheetId, sheetsClient, reflectionId);
  await writeDashboard(spreadsheetId, sheetsClient, dashboardId);
}

function mustGet<K, V>(m: Map<K, V>, key: K): V {
  const v = m.get(key);
  if (v === undefined) throw new Error(`tab id missing: ${key}`);
  return v;
}

async function maybeSeedReflectionTab(
  spreadsheetId: string,
  sheetsClient: ReturnType<typeof sheets>,
  reflectionId: number
): Promise<void> {
  const range = `'${SHEET.budget.reflectionTab}'!A2`;
  const got = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  if ((got.data.values?.[0]?.[0] ?? "") !== "") return;

  const header = reflectionHeader();
  const rows = reflectionRows(YEAR, DEFAULT_BUDGET);
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEET.budget.reflectionTab}'!A1:E${1 + rows.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [header, ...rows.map((r) => r.map(String))] },
  });

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId: reflectionId, startRowIndex: 1, endRowIndex: 13, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy년 m월" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        {
          repeatCell: {
            range: { sheetId: reflectionId, startRowIndex: 1, endRowIndex: 13, startColumnIndex: 1, endColumnIndex: 2 },
            cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "₩#,##0" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        {
          repeatCell: {
            range: { sheetId: reflectionId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
            cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12, foregroundColorStyle: { rgbColor: COLOR.sub } } } },
            fields: "userEnteredFormat.textFormat",
          },
        },
      ],
    },
  });
}

async function writeDashboard(
  spreadsheetId: string,
  sheetsClient: ReturnType<typeof sheets>,
  dashboardId: number
): Promise<void> {
  // Idempotency: clear cell values + delete existing charts before re-writing.
  await sheetsClient.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${SHEET.budget.dashboardTab}'!A1:Z100`,
  });

  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const dashSheet = meta.data.sheets?.find(
    (s) => s.properties?.sheetId === dashboardId
  );
  const existingChartIds = (dashSheet?.charts ?? [])
    .map((c) => c.chartId)
    .filter((x): x is number => typeof x === "number");
  if (existingChartIds.length > 0) {
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: existingChartIds.map((id) => ({
          deleteEmbeddedObject: { objectId: id },
        })),
      },
    });
  }

  const monthDefault = `${YEAR}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;

  const heroFormula = `=IFERROR(VLOOKUP(${MONTH_CELL},회고!A:E,2,FALSE),0)-${typeSumFormula("지출", MONTH_CELL).slice(1)}`;
  const budgetFormula = `=IFERROR(VLOOKUP(${MONTH_CELL},회고!A:E,2,FALSE),0)`;
  const expenseSumFormula = typeSumFormula("지출", MONTH_CELL);
  const usageFormula = `=IFERROR(${expenseSumFormula.slice(1)}/IFERROR(VLOOKUP(${MONTH_CELL},회고!A:E,2,FALSE),0),0)`;

  const values: { range: string; values: (string | number)[][] }[] = [
    { range: "'대시보드'!A1", values: [["다니의 가계부"]] },
    { range: "'대시보드'!D1", values: [["이번 달 가용 금액"]] },

    { range: "'대시보드'!A2", values: [[monthDefault]] },
    { range: "'대시보드'!D2", values: [[heroFormula]] },

    { range: "'대시보드'!D4", values: [["예산", "지출", "사용률"]] },
    { range: "'대시보드'!D5", values: [[budgetFormula, expenseSumFormula, usageFormula]] },

    { range: "'대시보드'!A7", values: [["지출", "수입", "저축"]] },
    {
      range: "'대시보드'!A8",
      values: [[
        typeSumFormula("지출", MONTH_CELL),
        typeSumFormula("수입", MONTH_CELL),
        typeSumFormula("저축", MONTH_CELL),
      ]],
    },

    { range: "'대시보드'!A10", values: [["카테고리"]] },
    { range: "'대시보드'!D10", values: [["결제수단"]] },
  ];

  // 카테고리 13행 (rows 11-23)
  EXPENSE_CATEGORIES.forEach((cat, i) => {
    values.push({
      range: `'대시보드'!A${11 + i}:B${11 + i}`,
      values: [[cat, categorySumFormula(cat, MONTH_CELL)]],
    });
  });

  // 결제수단 5행 (rows 11-15)
  PAYMENT_METHODS.forEach((pm, i) => {
    values.push({
      range: `'대시보드'!D${11 + i}:E${11 + i}`,
      values: [[pm, paymentMethodSumFormula(pm, MONTH_CELL)]],
    });
  });

  // 급여·카드 (rows 17-21)
  values.push({ range: "'대시보드'!D17", values: [["급여 · 카드 사용 현황"]] });
  values.push({
    range: "'대시보드'!D18:E18",
    values: [["월급", typeSumFormula("수입", MONTH_CELL)]],
  });
  ["현대카드", "우리카드", "삼성카드"].forEach((pm, i) => {
    values.push({
      range: `'대시보드'!D${19 + i}:E${19 + i}`,
      values: [[pm, paymentMethodSumFormula(pm, MONTH_CELL)]],
    });
  });

  // 회고 (rows 24-26)
  values.push({ range: "'대시보드'!A24", values: [["이번 달 회고"]] });
  values.push({ range: "'대시보드'!A25", values: [["잘한 점", "반성한 점", "주요 이벤트"]] });
  // A26, C26, E26 — 각각 2 columns 차지 (A:B, C:D, E:F merged for wider text)
  values.push({
    range: "'대시보드'!A26",
    values: [[reflectionLookupFormula(MONTH_CELL, 3)]],
  });
  values.push({
    range: "'대시보드'!C26",
    values: [[reflectionLookupFormula(MONTH_CELL, 4)]],
  });
  values.push({
    range: "'대시보드'!E26",
    values: [[reflectionLookupFormula(MONTH_CELL, 5)]],
  });

  await sheetsClient.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "USER_ENTERED", data: values },
  });

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: dashboardFormatRequests(dashboardId) },
  });
}

function dashboardFormatRequests(sheetId: number): sheets_v4.Schema$Request[] {
  return [
    {
      updateSheetProperties: {
        properties: { sheetId, tabColorStyle: { rgbColor: COLOR.blue } },
        fields: "tabColorStyle",
      },
    },

    // Background: white card across visible area
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 50, startColumnIndex: 0, endColumnIndex: 12 },
        cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: COLOR.card } } },
        fields: "userEnteredFormat.backgroundColorStyle",
      },
    },

    // Title A1 — large bold
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 22, foregroundColorStyle: { rgbColor: COLOR.text } },
            verticalAlignment: "MIDDLE",
          },
        },
        fields: "userEnteredFormat.textFormat,userEnteredFormat.verticalAlignment",
      },
    },

    // Month dropdown A2 — date format
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "DATE", pattern: "yyyy년 m월" },
            textFormat: { bold: true, fontSize: 13, foregroundColorStyle: { rgbColor: COLOR.sub } },
          },
        },
        fields: "userEnteredFormat",
      },
    },
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 },
        rule: {
          condition: {
            type: "ONE_OF_RANGE",
            values: [{ userEnteredValue: "=회고!A2:A13" }],
          },
          showCustomUi: true,
          strict: false,
        },
      },
    },

    // Hero label D1 — sub color, small
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 3, endColumnIndex: 6 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: false, fontSize: 11, foregroundColorStyle: { rgbColor: COLOR.sub } },
          },
        },
        fields: "userEnteredFormat.textFormat",
      },
    },

    // Hero value D2:F2 — merged + huge bold blue
    {
      mergeCells: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 3, endColumnIndex: 6 },
        mergeType: "MERGE_ALL",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 3, endColumnIndex: 6 },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "CURRENCY", pattern: "₩#,##0" },
            textFormat: { bold: true, fontSize: 28, foregroundColorStyle: { rgbColor: COLOR.blue } },
          },
        },
        fields: "userEnteredFormat",
      },
    },

    // 예산/지출/사용률 labels (D4:F4)
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 3, endColumnIndex: 6 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: false, fontSize: 11, foregroundColorStyle: { rgbColor: COLOR.sub } },
          },
        },
        fields: "userEnteredFormat.textFormat",
      },
    },
    // D5, E5: currency
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 3, endColumnIndex: 5 },
        cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "₩#,##0" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    // F5: percent
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 5, endColumnIndex: 6 },
        cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0.0%" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },

    // Stat labels A7:C7
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 3 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: false, fontSize: 11, foregroundColorStyle: { rgbColor: COLOR.sub } },
          },
        },
        fields: "userEnteredFormat.textFormat",
      },
    },

    // Stat values A8/B8/C8 — large bold currency, color per col
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 1 },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "CURRENCY", pattern: "₩#,##0" },
            textFormat: { bold: true, fontSize: 18, foregroundColorStyle: { rgbColor: COLOR.red } },
          },
        },
        fields: "userEnteredFormat",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 2 },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "CURRENCY", pattern: "₩#,##0" },
            textFormat: { bold: true, fontSize: 18, foregroundColorStyle: { rgbColor: COLOR.green } },
          },
        },
        fields: "userEnteredFormat",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 2, endColumnIndex: 3 },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "CURRENCY", pattern: "₩#,##0" },
            textFormat: { bold: true, fontSize: 18, foregroundColorStyle: { rgbColor: COLOR.blue } },
          },
        },
        fields: "userEnteredFormat",
      },
    },

    // Section headers: A10, D10, D17, A24 — bold larger
    ...[
      { row: 9, col: 0 }, // A10 카테고리
      { row: 9, col: 3 }, // D10 결제수단
      { row: 16, col: 3 }, // D17 급여·카드
      { row: 23, col: 0 }, // A24 회고
    ].map(({ row, col }) => ({
      repeatCell: {
        range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: col, endColumnIndex: col + 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14, foregroundColorStyle: { rgbColor: COLOR.text } } } },
        fields: "userEnteredFormat.textFormat",
      },
    })),

    // Helper tables (currency on B/E columns)
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 10, endRowIndex: 23, startColumnIndex: 1, endColumnIndex: 2 },
        cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "₩#,##0" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 10, endRowIndex: 15, startColumnIndex: 4, endColumnIndex: 5 },
        cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "₩#,##0" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 17, endRowIndex: 21, startColumnIndex: 4, endColumnIndex: 5 },
        cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "₩#,##0" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },

    // 회고 labels A25:C25
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 24, endRowIndex: 25, startColumnIndex: 0, endColumnIndex: 6 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: false, fontSize: 11, foregroundColorStyle: { rgbColor: COLOR.sub } },
          },
        },
        fields: "userEnteredFormat.textFormat",
      },
    },

    // 회고 values — merge each into a 2-col block (A26:B26, C26:D26, E26:F26)
    {
      mergeCells: {
        range: { sheetId, startRowIndex: 25, endRowIndex: 26, startColumnIndex: 0, endColumnIndex: 2 },
        mergeType: "MERGE_ALL",
      },
    },
    {
      mergeCells: {
        range: { sheetId, startRowIndex: 25, endRowIndex: 26, startColumnIndex: 2, endColumnIndex: 4 },
        mergeType: "MERGE_ALL",
      },
    },
    {
      mergeCells: {
        range: { sheetId, startRowIndex: 25, endRowIndex: 26, startColumnIndex: 4, endColumnIndex: 6 },
        mergeType: "MERGE_ALL",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 25, endRowIndex: 26, startColumnIndex: 0, endColumnIndex: 6 },
        cell: {
          userEnteredFormat: {
            wrapStrategy: "WRAP",
            verticalAlignment: "TOP",
            textFormat: { fontSize: 11, foregroundColorStyle: { rgbColor: COLOR.text } },
          },
        },
        fields: "userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat",
      },
    },

    // Hide gridlines
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { hideGridlines: true } },
        fields: "gridProperties.hideGridlines",
      },
    },

    // Column widths
    ...[
      { col: 0, w: 130 }, { col: 1, w: 130 }, { col: 2, w: 130 },
      { col: 3, w: 150 }, { col: 4, w: 150 }, { col: 5, w: 130 },
      { col: 6, w: 30 }, { col: 7, w: 360 },
    ].map(({ col, w }) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: col, endIndex: col + 1 },
        properties: { pixelSize: w },
        fields: "pixelSize",
      },
    })),

    // Row heights — give a bit of breathing room on key rows
    ...[
      { row: 0, h: 36 },  // title row
      { row: 1, h: 44 },  // hero row (taller for 28pt number)
      { row: 6, h: 24 },  // stat label row
      { row: 7, h: 32 },  // stat value row
      { row: 25, h: 80 }, // reflection wrap row
    ].map(({ row, h }) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: row, endIndex: row + 1 },
        properties: { pixelSize: h },
        fields: "pixelSize",
      },
    })),

    // Cat donut chart — anchor row 10 (idx 9), col H (idx 7)
    {
      addChart: {
        chart: {
          spec: {
            title: "카테고리별 지출",
            pieChart: {
              legendPosition: "RIGHT_LEGEND",
              pieHole: 0.5,
              domain: {
                sourceRange: {
                  sources: [{ sheetId, startRowIndex: 10, endRowIndex: 23, startColumnIndex: 0, endColumnIndex: 1 }],
                },
              },
              series: {
                sourceRange: {
                  sources: [{ sheetId, startRowIndex: 10, endRowIndex: 23, startColumnIndex: 1, endColumnIndex: 2 }],
                },
              },
            },
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId, rowIndex: 9, columnIndex: 7 },
              widthPixels: 360,
              heightPixels: 240,
            },
          },
        },
      },
    },

    // PM donut chart — anchor row 22 (idx 21), col H
    {
      addChart: {
        chart: {
          spec: {
            title: "결제수단별 지출",
            pieChart: {
              legendPosition: "RIGHT_LEGEND",
              pieHole: 0.5,
              domain: {
                sourceRange: {
                  sources: [{ sheetId, startRowIndex: 10, endRowIndex: 15, startColumnIndex: 3, endColumnIndex: 4 }],
                },
              },
              series: {
                sourceRange: {
                  sources: [{ sheetId, startRowIndex: 10, endRowIndex: 15, startColumnIndex: 4, endColumnIndex: 5 }],
                },
              },
            },
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId, rowIndex: 21, columnIndex: 7 },
              widthPixels: 360,
              heightPixels: 200,
            },
          },
        },
      },
    },
  ];
}
