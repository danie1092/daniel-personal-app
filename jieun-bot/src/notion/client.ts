import { Client } from "@notionhq/client";
import { loadEnv } from "../env.js";

let cached: Client | null = null;

export function notion(): Client {
  if (!cached) cached = new Client({ auth: loadEnv().NOTION_TOKEN });
  return cached;
}

// Single-source databases under My Life. `db` is parent for pages.create,
// `ds` (data_source_id) is for dataSources.query.
export const NOTION_DB = {
  routineItems: {
    db: "931cfd179c1247429ae6a18ebec597e5",
    ds: "46e7d517-0702-453d-aedb-a3f81a8972c7",
  },
  routineChecks: {
    db: "71e10e82c4f040d6a7e386e8573a1284",
    ds: "ce2e9edb-8405-438b-a7de-0f3d51eb5fa1",
  },
  observation: {
    db: "396fdab9e2d746499340be8bb370635e",
    ds: "fc7ea116-1908-4a64-b794-b6f78832188a",
  },
  // setupDailyConditionDb 실행 후 출력된 ID로 채울 것. 기본값(빈 문자열)이면
  // syncDailyLog가 no-op으로 빠짐 — DB 미생성 상태에서 잡 죽지 않게.
  dailyCondition: {
    db: "",
    ds: "",
  },
} as const;
