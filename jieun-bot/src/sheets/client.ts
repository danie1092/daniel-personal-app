import { google, type sheets_v4 } from "googleapis";
import { loadEnv } from "../env.js";

let cached: sheets_v4.Sheets | null = null;

export function sheets(): sheets_v4.Sheets {
  if (cached) return cached;
  const env = loadEnv();
  const auth = new google.auth.GoogleAuth({
    keyFile: env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cached = google.sheets({ version: "v4", auth });
  return cached;
}

export const SHEET = {
  budget: {
    spreadsheetId: (): string => loadEnv().GOOGLE_SHEETS_BUDGET_ID,
    dataTab: "데이터",
    reflectionTab: "회고",
    dashboardTab: "대시보드",
    headers: ["날짜", "카테고리", "금액", "유형", "메모", "결제수단"] as const,
    // Sync writes 6 columns (A:F). 유형 column is in Korean (지출/수입/저축).
  },
} as const;
