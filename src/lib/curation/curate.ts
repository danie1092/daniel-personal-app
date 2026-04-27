import Anthropic from "@anthropic-ai/sdk";
import { CURATION_CATEGORIES, isCurationCategory, type CurationCategory } from "./categories";

const MAX_SUMMARY_LEN = 200;
const MODEL = "claude-haiku-4-5-20251001";

// Haiku 4.5의 prompt cache는 시스템 프롬프트가 충분히 길 때만 발효된다.
// 카테고리 정의 + 형식 규칙 + 풍부한 few-shot 예시로 임계 토큰을 넉넉히 넘긴다.
const SYSTEM_PROMPT = `당신은 한국어로 작성된 인스타그램 게시물 링크를 분석해서 한 줄 요약과 카테고리를 부여하는 어시스턴트다.

## 출력 형식
반드시 아래 JSON만 단일 객체로 출력. 다른 텍스트, 코드블록, 설명 금지.

{ "summary": "1~2 문장 한국어 요약 (최대 200자)", "category": "8개 중 하나" }

## 카테고리 (반드시 이 8개 중 하나)
${CURATION_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n")}

## 분류 가이드
- 음식·카페: 식당, 카페, 베이커리, 디저트, 음식 레시피, 와인바, 위스키바, 분식, 파인다이닝
- 여행: 국내외 여행지, 숙소, 호텔, 비행기, 여행 코스, 도시 가이드, 풍경 사진, 여행 팁
- 패션: 옷, 신발, 가방, 액세서리, 코디, 룩북, 브랜드, 쇼핑몰, 스타일링
- 운동: 헬스, 요가, 필라테스, 러닝, 등산, 클라이밍, 골프, 스포츠 용품, 운동 루틴, 식단
- 인테리어: 가구, 조명, 홈데코, 식물, 거실, 침실, 주방, 셀프 인테리어, 리빙 용품
- 영감: 사진, 일러스트, 디자인, 글귀, 영화 장면, 예술 작품, 무드보드, 카피
- 정보·꿀팁: 생활 팁, 앱, 서비스 추천, 할인, 이벤트, 부동산, 금융, 개발 팁, 업무 팁
- 기타: 위 7개에 명확히 안 맞는 경우만 사용 (가능한 한 위 7개에 우겨넣을 것)

## 분류 예시 (입력 → 출력)

입력: URL=https://instagram.com/p/cafe-sinsa OG_title=신사동 디저트 카페 OG_description=시그니처 휘낭시에가 유명한 곳 memo=다음에 가보기
출력: {"summary":"신사동 디저트 카페, 시그니처 휘낭시에 유명","category":"음식·카페"}

입력: URL=https://instagram.com/p/jeju-stay OG_title=제주 한 달 살기 OG_description=애월읍 독채 펜션 후기 memo=
출력: {"summary":"제주 애월읍 독채 펜션 한 달 살기 후기","category":"여행"}

입력: URL=https://instagram.com/p/look01 OG_title=가을 코디 OG_description=베이지 트렌치 + 블랙 슬랙스 memo=
출력: {"summary":"가을 베이지 트렌치 + 블랙 슬랙스 코디","category":"패션"}

입력: URL=https://instagram.com/p/yoga01 OG_title=아침 요가 루틴 10분 OG_description=초보자용 memo=
출력: {"summary":"초보자용 아침 요가 10분 루틴","category":"운동"}

입력: URL=https://instagram.com/p/livingroom OG_title=북유럽 거실 OG_description=화이트 톤 + 우드 가구 memo=참고
출력: {"summary":"북유럽 화이트 톤 + 우드 가구 거실 인테리어","category":"인테리어"}

입력: URL=https://instagram.com/p/quote01 OG_title=오늘의 글귀 OG_description=느리게 가도 괜찮다 memo=
출력: {"summary":"느리게 가도 괜찮다 — 오늘의 글귀","category":"영감"}

입력: URL=https://instagram.com/p/notion-tip OG_title=노션 단축키 모음 OG_description=업무 효율 5배 memo=업무용
출력: {"summary":"업무 효율 올려주는 노션 단축키 모음","category":"정보·꿀팁"}

입력: URL=https://instagram.com/p/hike01 OG_title=북한산 등반 코스 OG_description=초보자 추천 memo=
출력: {"summary":"북한산 초보자 추천 등반 코스","category":"운동"}

입력: URL=https://instagram.com/p/photo01 OG_title=흑백 인물 사진 OG_description=감성 포트레이트 memo=무드
출력: {"summary":"흑백 인물 감성 포트레이트 사진","category":"영감"}

입력: URL=https://instagram.com/p/lighting01 OG_title=무드등 추천 OG_description=USB 충전 무선 memo=
출력: {"summary":"USB 충전 무선 무드등 추천","category":"인테리어"}

입력: URL=https://instagram.com/p/savings OG_title=청년 적금 비교 OG_description=금리 5%대 memo=
출력: {"summary":"금리 5%대 청년 적금 비교","category":"정보·꿀팁"}

입력: URL=https://instagram.com/p/run01 OG_title=한강 러닝 코스 OG_description=10km memo=주말
출력: {"summary":"주말 한강 10km 러닝 코스","category":"운동"}

## 규칙
- summary는 한국어 한 줄, 200자 이내. 광고 문구나 해시태그 금지.
- memo가 있으면 사용자의 의도를 반영. (예: memo="아침에" → summary에 "아침" 포함)
- OG 정보가 비어 있으면 URL과 memo만 보고 추정.
- 절대 카테고리 8개 외의 값을 만들지 말 것.
- 절대 JSON 외의 텍스트(주석, 설명, 코드블록) 추가하지 말 것.`;

export type CurateInput = {
  url: string;
  memo: string | null;
  ogTitle: string;
  ogDescription: string;
};

export type CurateResult =
  | { ok: true; summary: string; category: CurationCategory }
  | { ok: false; kind: "transient" | "permanent"; error: string };

function classifyError(err: unknown): "transient" | "permanent" {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status ?? 0;
    if (status === 429 || status >= 500) return "transient";
    if (status >= 400) return "permanent";
  }
  // 네트워크 오류 등은 transient로 본다
  return "transient";
}

export async function curateItem(input: CurateInput): Promise<CurateResult> {
  const userMessage = [
    `URL=${input.url}`,
    `OG_title=${input.ogTitle || "(없음)"}`,
    `OG_description=${input.ogDescription || "(없음)"}`,
    `memo=${input.memo ?? ""}`,
  ].join(" ");

  let raw: { content: Array<{ type: string; text?: string }> };
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    raw = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    }) as { content: Array<{ type: string; text?: string }> };
  } catch (err) {
    const kind = classifyError(err);
    const msg = err instanceof Error ? err.message : "unknown";
    return { ok: false, kind, error: msg };
  }

  const text = raw.content[0]?.type === "text" ? (raw.content[0].text ?? "") : "";
  let parsed: unknown;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  } catch {
    return { ok: false, kind: "permanent", error: "invalid JSON" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, kind: "permanent", error: "invalid JSON" };
  }
  const obj = parsed as Record<string, unknown>;
  const summaryRaw = typeof obj.summary === "string" ? obj.summary.trim() : "";
  const category = obj.category;

  if (!summaryRaw) return { ok: false, kind: "permanent", error: "empty summary" };
  if (!isCurationCategory(category)) {
    return { ok: false, kind: "permanent", error: "invalid category" };
  }
  const summary = summaryRaw.length > MAX_SUMMARY_LEN ? summaryRaw.slice(0, MAX_SUMMARY_LEN) : summaryRaw;
  return { ok: true, summary, category };
}
