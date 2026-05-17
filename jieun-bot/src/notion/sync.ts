import { notion, NOTION_DB } from "./client.js";
import { db } from "../db/client.js";
import {
  getNotionPageId,
  getRowIdByNotionPage,
  recordSync,
  deleteSyncMapRow,
} from "../db/notionSyncMap.js";

// 노션 페이지가 archived(휴지통) 상태일 때 update 시 던지는 에러 메시지의 핵심 토큰.
// validation_error code도 같이 보지만 메시지 매칭이 더 안전.
function isArchivedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("archived") && msg.includes("unarchive");
}

const T = (s: string) => [{ text: { content: s } }];
const trimText = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

const KIND_TO_TOPIC: Record<string, string> = {
  pattern: "패턴",
  preference: "강점",
  tone: "주의",
};

function chunkBlocks(text: string) {
  const safe = text || "";
  const chunks: string[] = [];
  for (let i = 0; i < safe.length; i += 1900) chunks.push(safe.slice(i, i + 1900));
  return chunks.map((c) => ({
    object: "block" as const,
    type: "paragraph" as const,
    paragraph: { rich_text: [{ type: "text" as const, text: { content: c } }] },
  }));
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 노션 → DB: 사용자가 노션에서 등록·수정한 routine_items를 cache.
export async function syncRoutineItems(): Promise<{ inserted: number; updated: number }> {
  let cursor: string | undefined = undefined;
  let inserted = 0;
  let updated = 0;
  do {
    const res: any = await notion().dataSources.query({
      data_source_id: NOTION_DB.routineItems.ds,
      page_size: 100,
      start_cursor: cursor,
    });
    for (const page of res.results) {
      if (!("properties" in page)) continue;
      const props = page.properties as Record<string, any>;
      const name: string =
        props["항목"]?.title?.[0]?.plain_text?.trim() ?? "";
      if (!name) continue;
      const category: string | null = props["카테고리"]?.select?.name ?? null;
      const isActive: boolean =
        typeof props["활성"]?.checkbox === "boolean" ? props["활성"].checkbox : true;
      // 시간대 select(아침/낮/저녁) → DB 텍스트(morning/afternoon/evening).
      const slotName: string | null = props["시간대"]?.select?.name ?? null;
      const slotMap: Record<string, string> = {
        "아침": "morning",
        "낮": "afternoon",
        "저녁": "evening",
      };
      const timeSlot: string | null = slotName ? (slotMap[slotName] ?? null) : null;
      const notionPageId: string = page.id;

      const existingDbId = await getRowIdByNotionPage("routine_items", notionPageId);
      if (existingDbId) {
        const { error } = await db()
          .from("routine_items")
          .update({ name, category, is_active: isActive, time_slot: timeSlot })
          .eq("id", existingDbId);
        if (error) throw error;
        updated++;
      } else {
        const { data, error } = await db()
          .from("routine_items")
          .insert({ name, category, is_active: isActive, time_slot: timeSlot })
          .select("id")
          .single();
        if (error) throw error;
        await recordSync("routine_items", data.id as string, notionPageId);
        inserted++;
      }
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return { inserted, updated };
}

// DB → 노션
export async function syncRoutineChecks(sinceDays = 14): Promise<number> {
  const since = isoDate(daysAgo(sinceDays));
  const { data: checks, error } = await db()
    .from("routine_checks")
    .select("item_id, date, checked")
    .gte("date", since);
  if (error) throw error;

  let pushed = 0;
  let archivedCleaned = 0;
  for (const c of checks ?? []) {
    const itemId = c.item_id as string;
    const date = c.date as string;
    const rowKey = `${itemId}_${date}`;
    const existing = await getNotionPageId("routine_checks", rowKey);
    const itemNotionId = await getNotionPageId("routine_items", itemId);
    const properties: Record<string, any> = {
      "체크": { title: T(`${date}`) },
      "날짜": { date: { start: date } },
      "완료": { checkbox: !!c.checked },
    };
    if (itemNotionId) {
      properties["항목"] = { relation: [{ id: itemNotionId }] };
    }
    try {
      if (existing) {
        await notion().pages.update({ page_id: existing, properties });
      } else {
        const created = await notion().pages.create({
          parent: { database_id: NOTION_DB.routineChecks.db },
          properties,
        });
        await recordSync("routine_checks", rowKey, created.id);
        pushed++;
      }
    } catch (err) {
      // 사용자가 노션에서 휴지통으로 보낸 페이지 → sync_map row 정리해서
      // 다음 사이클에 새로 만들게 하고 1행 실패가 전체 sync 막지 않게.
      if (isArchivedError(err) && existing) {
        await deleteSyncMapRow("routine_checks", rowKey);
        archivedCleaned++;
        continue;
      }
      throw err;
    }
  }
  if (archivedCleaned > 0) {
    // 다음 사이클을 위해 통계만 — 다음 호출에서 자동 복구.
    // (logger 직접 못 쓰는 함수라 호출자 stage 로그에 묻혀도 OK.)
  }
  return pushed;
}

export async function syncDailyObservation(sinceDays = 14): Promise<number> {
  const since = isoDate(daysAgo(sinceDays));
  const { data, error } = await db()
    .from("daily_summary")
    .select("date, summary")
    .gte("date", since);
  if (error) throw error;

  let pushed = 0;
  for (const row of data ?? []) {
    const date = row.date as string;
    const summary = (row.summary as string) ?? "";
    pushed += await pushObservationRow({
      table: "daily_summary",
      rowKey: date,
      title: `${date} 관찰`,
      date,
      topic: "일별",
      summary,
    });
  }
  return pushed;
}

export async function syncWeeklyObservation(sinceWeeks = 8): Promise<number> {
  const since = isoDate(daysAgo(sinceWeeks * 7));
  const { data, error } = await db()
    .from("weekly_summary")
    .select("week_start, summary")
    .gte("week_start", since);
  if (error) throw error;

  let pushed = 0;
  for (const row of data ?? []) {
    const date = row.week_start as string;
    const summary = (row.summary as string) ?? "";
    pushed += await pushObservationRow({
      table: "weekly_summary",
      rowKey: date,
      title: `${date} 주간 관찰`,
      date,
      topic: "주간",
      summary,
    });
  }
  return pushed;
}

export async function syncUserProfile(): Promise<number> {
  const { data, error } = await db()
    .from("user_profile")
    .select("id, kind, observation, evidence_dates, created_at")
    .is("superseded_by", null);
  if (error) throw error;

  let pushed = 0;
  for (const row of data ?? []) {
    const id = row.id as string;
    const kind = row.kind as string;
    const observation = (row.observation as string) ?? "";
    if (!observation) continue;
    const date =
      (row.evidence_dates as string[] | null)?.[0] ??
      (row.created_at as string).slice(0, 10);
    const topic = KIND_TO_TOPIC[kind] ?? "패턴";
    pushed += await pushObservationRow({
      table: "user_profile",
      rowKey: id,
      title: trimText(observation, 60),
      date,
      topic,
      summary: observation,
    });
  }
  return pushed;
}

// DB → 노션: daily_log 최근 14일을 📊 일일 컨디션 DB에 upsert.
// dailyCondition.db가 빈 문자열이면 no-op (DB 미생성 환경 보호).
export async function syncDailyLog(sinceDays = 14): Promise<number> {
  if (!NOTION_DB.dailyCondition.db) return 0;
  const since = isoDate(daysAgo(sinceDays));
  const { data, error } = await db()
    .from("daily_log")
    .select(
      "date, sleep_score, sleep_text, mood_score, mood_text, energy_score, energy_text, breakfast, lunch, dinner"
    )
    .gte("date", since);
  if (error) throw error;

  let pushed = 0;
  for (const row of data ?? []) {
    const date = row.date as string;
    const properties: Record<string, any> = {
      "날짜 표시": { title: T(date) },
      "날짜": { date: { start: date } },
    };
    const setNum = (key: string, v: unknown) => {
      if (typeof v === "number") properties[key] = { number: v };
    };
    const setText = (key: string, v: unknown) => {
      if (typeof v === "string" && v) properties[key] = { rich_text: T(trimText(v, 1900)) };
    };
    setNum("수면점수", row.sleep_score);
    setText("수면메모", row.sleep_text);
    setNum("기분점수", row.mood_score);
    setText("기분메모", row.mood_text);
    setNum("에너지점수", row.energy_score);
    setText("에너지메모", row.energy_text);
    setText("아침", row.breakfast);
    setText("점심", row.lunch);
    setText("저녁", row.dinner);

    const existing = await getNotionPageId("daily_log", date);
    let needsCreate = !existing;
    if (existing) {
      try {
        await notion().pages.update({ page_id: existing, properties });
      } catch (err) {
        if (!isArchivedError(err)) throw err;
        await deleteSyncMapRow("daily_log", date);
        needsCreate = true;
      }
    }
    if (needsCreate) {
      const created = await notion().pages.create({
        parent: { database_id: NOTION_DB.dailyCondition.db },
        properties,
      });
      await recordSync("daily_log", date, created.id);
      pushed++;
    }
  }
  return pushed;
}

async function pushObservationRow(args: {
  table: string;
  rowKey: string;
  title: string;
  date: string;
  topic: string;
  summary: string;
}): Promise<number> {
  const existing = await getNotionPageId(args.table, args.rowKey);
  const properties: Record<string, any> = {
    "제목": { title: T(args.title) },
    "날짜": { date: { start: args.date } },
    "주제": { multi_select: [{ name: args.topic }] },
    "요약": { rich_text: T(trimText(args.summary, 1900)) },
  };
  if (existing) {
    try {
      await notion().pages.update({ page_id: existing, properties });
      return 0;
    } catch (err) {
      if (!isArchivedError(err)) throw err;
      // archived → sync_map 정리하고 새로 생성 fall-through.
      await deleteSyncMapRow(args.table, args.rowKey);
    }
  }
  const created = await notion().pages.create({
    parent: { database_id: NOTION_DB.observation.db },
    properties,
    children: chunkBlocks(args.summary),
  });
  await recordSync(args.table, args.rowKey, created.id);
  return 1;
}
