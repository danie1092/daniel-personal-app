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
  dailyCondition: {
    db: "d72e26499ced413683c744d42460c310",
    ds: "7003008b-c351-42f4-af4e-7f3ff2597a4b",
  },
} as const;
