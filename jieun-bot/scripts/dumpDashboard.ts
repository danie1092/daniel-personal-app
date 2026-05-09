import { sheets, SHEET } from "../src/sheets/client.js";

const r = await sheets().spreadsheets.values.get({
  spreadsheetId: SHEET.budget.spreadsheetId(),
  range: "대시보드!A1:N50",
  valueRenderOption: "FORMULA",
});

const rows = r.data.values ?? [];
for (let i = 0; i < rows.length; i++) {
  const row = rows[i] ?? [];
  for (let j = 0; j < row.length; j++) {
    const v = row[j];
    if (v !== "" && v !== null && v !== undefined) {
      const colLetter = String.fromCharCode(65 + j);
      console.log(`${colLetter}${i + 1}: ${JSON.stringify(v)}`);
    }
  }
}
process.exit(0);
