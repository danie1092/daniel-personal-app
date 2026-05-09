import { notion } from "./client.js";

/**
 * 노션 `다영이 기록` 페이지 하위에 `📊 일일 컨디션` DB를 1회성 생성.
 *
 * 실행 후 출력된 `database_id` + `data_source_id`를 `notion/client.ts`의
 * `NOTION_DB.dailyCondition`에 박아넣고 syncDailyLog가 그 ID를 사용한다.
 *
 * routineItems DB의 `시간대` select 컬럼은 노션 UI에서 직접 추가
 * (아침/낮/저녁 옵션). 자동화하지 않은 이유: notion API가 같은 DB의
 * 기존 select 옵션을 보존하면서 새 컬럼만 추가하는 패턴이 까다로워
 * 한 번에 끝나는 UI가 더 안전.
 *
 * Usage: `tsx scripts/runSetupDailyConditionDb.ts <parent-page-id>`
 *   parent-page-id: `다영이 기록` 페이지 URL의 마지막 32자 (하이픈 포함 OK).
 */
export async function setupDailyConditionDb(parentPageId: string): Promise<{
  database_id: string;
  data_source_id: string;
}> {
  // Notion SDK v5+: properties는 initial_data_source 안으로 들어감.
  const created: any = await notion().databases.create({
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: "📊 일일 컨디션" } }],
    initial_data_source: {
      properties: {
        "날짜": { date: {} },
        "수면점수": { number: {} },
        "수면메모": { rich_text: {} },
        "기분점수": { number: {} },
        "기분메모": { rich_text: {} },
        "에너지점수": { number: {} },
        "에너지메모": { rich_text: {} },
        "아침": { rich_text: {} },
        "점심": { rich_text: {} },
        "저녁": { rich_text: {} },
      },
    },
  });

  const dbId: string = created.id;
  const dsId: string = created.data_sources?.[0]?.id ?? "";

  if (!dsId) {
    throw new Error("data_source_id 못 찾음 — 노션 응답 확인 필요");
  }

  return { database_id: dbId, data_source_id: dsId };
}
