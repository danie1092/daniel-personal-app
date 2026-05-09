import { setupDailyConditionDb } from "../src/notion/setupDailyConditionDb.js";

const parentPageId = process.argv[2];
if (!parentPageId) {
  console.error("usage: tsx scripts/runSetupDailyConditionDb.ts <parent-page-id>");
  console.error("  parent-page-id: '다영이 기록' 페이지 URL 끝의 32자.");
  process.exit(1);
}

const result = await setupDailyConditionDb(parentPageId);
console.log("setup:dailyConditionDb ok");
console.log(JSON.stringify(result, null, 2));
console.log();
console.log("→ src/notion/client.ts의 NOTION_DB에 아래를 추가:");
console.log(`  dailyCondition: {`);
console.log(`    db: "${result.database_id.replace(/-/g, "")}",`);
console.log(`    ds: "${result.data_source_id}",`);
console.log(`  },`);
process.exit(0);
