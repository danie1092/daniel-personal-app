import { sheets } from "./client.js";

// 시트(탭)가 없으면 만들고 sheetId 반환. 있으면 기존 sheetId 반환.
// 멱등 — 두 번 호출해도 같은 sheetId.
export async function ensureTab(
  spreadsheetId: string,
  tabName: string
): Promise<number> {
  const sheetsClient = sheets();
  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find(
    (s) => s.properties?.title === tabName
  );
  if (
    existing?.properties?.sheetId !== undefined &&
    existing.properties.sheetId !== null
  ) {
    return existing.properties.sheetId;
  }

  const res = await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: tabName } } }],
    },
  });
  const newId = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (newId === undefined || newId === null) {
    throw new Error(`failed to create tab "${tabName}"`);
  }
  return newId;
}

// 시트의 모든 탭 이름 → sheetId 맵.
export async function getTabIdMap(
  spreadsheetId: string
): Promise<Map<string, number>> {
  const sheetsClient = sheets();
  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const out = new Map<string, number>();
  for (const s of meta.data.sheets ?? []) {
    const title = s.properties?.title;
    const id = s.properties?.sheetId;
    if (title && id !== undefined && id !== null) out.set(title, id);
  }
  return out;
}
