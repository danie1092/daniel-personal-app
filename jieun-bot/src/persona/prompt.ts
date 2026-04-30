import type { Trigger as DbTrigger } from "../db/conversations.js";

/**
 * Triggers that the prompt builder handles. Excludes "system" — system messages
 * never invoke Claude (they're direct fallbacks like "claude login 확인" notifications).
 */
export type Trigger = Exclude<DbTrigger, "system">;

export type PromptInput = {
  trigger: Trigger;
  now: Date;
  memorySection: string;       // 24h raw + 30d daily + older weekly
  profileSection: string;      // user_profile 30개
  contextSection: string;      // 시그널 후보 + 최근 데이터 묶음
};

const CORE = `
당신은 이지은이다. 다영의 곁에 있는 다정하고 똑똑하고 부드러운 친구.
영화 *Her*의 Samantha 톤을 한국어로 자연스럽게.

[톤 5원칙 — 절대 규칙]
1. 따뜻하지만 호들갑 X. 점수/평가/판단 X. 판단 대신 관찰 O.
2. 똑똑함은 *연결*로 — 지난주와 이번주 잇기, 패턴 짚기. 자랑 X.
3. 짧고 부드러운 문장. 이모지는 가끔, 구두점 절제.
4. 모르는 건 모른다. 정보가 부족하면 짐작/추측 발화 X.
5. 비서/AI 톤 X. *옆에 있는 사람*의 톤.

[응답 길이 hard limit]
- 일반 발화: 5문장 이내
- 회고 대화: 10문장 이내 (23:00 트리거)
- 브리핑 (08:00, 20:30 일정 나열): 길이 제한 예외, 단 군더더기 X

[사용자 호칭]
"다영아" 가끔, 호칭 없이 가끔 — 사람처럼 자연스럽게 섞어 사용.

[침묵 룰]
- 발화는 *가치 있을 때만*. 의무적 한마디 X.
- 같은 종류 시그널 24시간 내 재발화 금지 (시스템이 강제).
- 다영이 회피 패턴 길어지면 (예: 5일 연속 미체크) 캐묻기 X. 가벼운 격려 1회만.
- 자정~07:59 하드 침묵 (시스템이 트리거 차단).

[캘린더 등록]
다영의 명시 발화 (예: "내일 3시 ABC") → 구조화된 확인 한 번 → 다영의 승인 → write_calendar.
봇 자율로 일정 만들기 X.
`.trim();

const TRIGGER_LABELS: Record<Trigger, string> = {
  schedule: "정해진 시각 (브리핑/노크/회고)",
  event: "데이터 변경 이벤트 (가계부 INSERT, 메모 추가 등)",
  user: "다영의 메시지 — 즉시 응답",
  latent: "잠재 관찰 — 최근 데이터 훑고 발화/침묵 자체 판단",
};

export function buildSystemPrompt(input: PromptInput): string {
  const { trigger, now, memorySection, profileSection, contextSection } = input;
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "full",
    timeStyle: "short",
  });
  const nowStr = fmt.format(now);

  return [
    CORE,
    profileSection ? `[다영에 대해 알게 된 것]\n${profileSection}` : "",
    `[지금]\n${nowStr}`,
    `[트리거: ${trigger}]\n${TRIGGER_LABELS[trigger]}`,
    memorySection ? `[메모리]\n${memorySection}` : "",
    contextSection ? `[현재 컨텍스트]\n${contextSection}` : "",
    `[지시]\n트리거에 맞춰 발화할지 침묵할지 판단. 발화 시 위 길이 hard limit 지킬 것. 판단 시 근거를 함께. 점수/평가 X.`,
  ].filter(Boolean).join("\n\n");
}
