import { createClient } from "@/lib/supabase/server";
import { CURATION_CATEGORIES, type CurationCategory } from "./categories";

export type CurationItem = {
  id: string;
  url: string;
  memo: string | null;
  summary: string;
  category: CurationCategory;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  createdAt: string;
  processedAt: string;
};

export type CurationFilter = CurationCategory | "all" | "dead-letter";

type Row = {
  id: string;
  url: string;
  memo: string | null;
  summary: string | null;
  category: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  created_at: string;
  processed_at: string | null;
};

function mapRow(row: Row): CurationItem {
  return {
    id: row.id,
    url: row.url,
    memo: row.memo,
    summary: row.summary ?? "",
    category: (row.category ?? "기타") as CurationCategory,
    ogTitle: row.og_title ?? "",
    ogDescription: row.og_description ?? "",
    ogImage: row.og_image ?? "",
    createdAt: row.created_at,
    processedAt: row.processed_at ?? row.created_at,
  };
}

const SELECT_COLS =
  "id, url, memo, summary, category, og_title, og_description, og_image, created_at, processed_at";

export async function getCurationItems(filter: CurationFilter): Promise<CurationItem[]> {
  const sb = await createClient();

  if (filter === "dead-letter") {
    const { data } = await sb
      .from("collected_items")
      .select(SELECT_COLS)
      .gte("processing_attempts", 5)
      .is("processed_at", null)
      .order("created_at", { ascending: false });
    return (data ?? []).map((r) => mapRow(r as Row));
  }

  if (filter === "all") {
    const { data } = await sb
      .from("collected_items")
      .select(SELECT_COLS)
      .not("processed_at", "is", null)
      .order("processed_at", { ascending: false });
    return (data ?? []).map((r) => mapRow(r as Row));
  }

  // 단일 카테고리
  const { data } = await sb
    .from("collected_items")
    .select(SELECT_COLS)
    .not("processed_at", "is", null)
    .eq("category", filter)
    .order("processed_at", { ascending: false });
  return (data ?? []).map((r) => mapRow(r as Row));
}

export async function getCategoryCounts(): Promise<Record<CurationFilter, number>> {
  const sb = await createClient();

  const out: Record<CurationFilter, number> = {
    all: 0,
    "dead-letter": 0,
    "음식·카페": 0,
    여행: 0,
    패션: 0,
    운동: 0,
    인테리어: 0,
    영감: 0,
    "정보·꿀팁": 0,
    기타: 0,
  };

  // all
  const { count: allCount } = await sb
    .from("collected_items")
    .select("id", { count: "exact", head: true })
    .not("processed_at", "is", null);
  out.all = allCount ?? 0;

  // dead-letter
  const { count: deadCount } = await sb
    .from("collected_items")
    .select("id", { count: "exact", head: true })
    .gte("processing_attempts", 5)
    .is("processed_at", null);
  out["dead-letter"] = deadCount ?? 0;

  // 카테고리별 (8회 쿼리, 단일 사용자 환경에서 충분)
  for (const cat of CURATION_CATEGORIES) {
    const { count } = await sb
      .from("collected_items")
      .select("id", { count: "exact", head: true })
      .not("processed_at", "is", null)
      .eq("category", cat);
    out[cat] = count ?? 0;
  }

  return out;
}
