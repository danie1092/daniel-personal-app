import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { MEMO_TAGS } from "@/lib/constants";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

async function fetchOGMeta(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "bot" },
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();
    const title =
      html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i)?.[1] ??
      html.match(/<title>([^<]*)<\/title>/i)?.[1] ??
      "";
    const description =
      html.match(
        /<meta\s+property="og:description"\s+content="([^"]*)"/i
      )?.[1] ??
      html.match(
        /<meta\s+name="description"\s+content="([^"]*)"/i
      )?.[1] ??
      "";
    return { title, description };
  } catch {
    return { title: "", description: "" };
  }
}

export async function POST() {
  try {
    const supabase = getSupabase();
    const anthropic = getAnthropic();

    const { data: items, error } = await supabase
      .from("collected_items")
      .select("*")
      .eq("is_processed", false)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!items || items.length === 0) {
      return Response.json({ groups: [] });
    }

    // OG 메타데이터 크롤링
    const enriched = await Promise.all(
      items.map(async (item) => {
        const og = await fetchOGMeta(item.url);
        return { ...item, og };
      })
    );

    const itemsText = enriched
      .map(
        (item, i) =>
          `[${i + 1}] id: ${item.id}\n    URL: ${item.url}\n    source: ${item.source}\n    memo: ${item.memo || "(없음)"}\n    OG title: ${item.og.title || "(없음)"}\n    OG description: ${item.og.description || "(없음)"}`
      )
      .join("\n\n");

    const tagList = MEMO_TAGS.join(", ");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `아래는 사용자가 수집한 URL 목록입니다. 이 항목들을 분석해서 주제별로 묶고, 각 그룹에 대해 메모 초안을 작성해주세요.

규칙:
1. 중복 URL이 있으면 하나로 합칩니다
2. 비슷한 주제의 항목을 그룹으로 묶습니다
3. 각 그룹에 대해 한국어 메모 초안을 작성합니다 (간결하고 유용하게)
4. 각 그룹에 가장 적절한 태그를 선택합니다. 사용 가능한 태그: ${tagList}
5. 반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이)

JSON 형식:
{
  "groups": [
    {
      "topic": "주제 이름",
      "tag": "태그",
      "content": "메모 초안 내용 (URL 포함)",
      "item_ids": ["id1", "id2"]
    }
  ]
}

수집된 항목:
${itemsText}`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "AI 응답 파싱 실패" }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);
    return Response.json(result);
  } catch (err) {
    console.error("Organize error:", err);
    return Response.json({ error: "정리 중 오류 발생" }, { status: 500 });
  }
}
