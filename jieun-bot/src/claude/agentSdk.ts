import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeAdapter, ClaudeCallInput, ClaudeCallResult } from "./adapter.js";

export class AgentSdkClaude implements ClaudeAdapter {
  async ask(input: ClaudeCallInput): Promise<ClaudeCallResult> {
    const start = Date.now();
    // 다중 turn (maxTurns=3) 케이스에서 turn마다 assistant text 누적하면 동일
    // 응답이 두 번 발신되는 phantom duplicate 발생 (라이브 1회 재현). 누적 X,
    // *마지막* turn의 텍스트만 keep — 도구 없으니 마지막 turn = 최종 답변.
    let lastAssistantText = "";
    let cacheReadTokens: number | undefined;
    let cacheCreationTokens: number | undefined;
    let inputTokens: number | undefined;

    const q = query({
      prompt: input.userPrompt,
      options: {
        systemPrompt: input.systemPrompt,
        model: "sonnet",
        maxTurns: 3,             // event 트리거의 "침묵 OK" 지시처럼 결정 단계가 있으면 1턴은 부족.
                                 // 도구 없으니 폭주 위험 없음. 자세한 분석은 git log d157381 이후 commit 참고.
        allowedTools: [],        // Block 1엔 도구 없음 — Block 2부터 추가
      },
    });

    for await (const msg of q) {
      if (msg.type === "assistant" && msg.message?.content) {
        let turnText = "";
        for (const block of msg.message.content) {
          if (block.type === "text" && "text" in block) {
            turnText += (block as { text: string }).text;
          }
        }
        if (turnText) lastAssistantText = turnText;
      }
      if (msg.type === "result") {
        if (msg.subtype !== "success") {
          throw new Error(`claude error: ${msg.subtype} — ${JSON.stringify(msg).slice(0, 200)}`);
        }
        // Agent SDK가 자동 caching 적용 — 결과 메시지에 통계 박혀있음.
        const usage = (msg as { usage?: { cache_read_input_tokens?: number; cache_creation_input_tokens?: number; input_tokens?: number } }).usage;
        if (usage) {
          cacheReadTokens = usage.cache_read_input_tokens;
          cacheCreationTokens = usage.cache_creation_input_tokens;
          inputTokens = usage.input_tokens;
        }
      }
    }

    return {
      text: lastAssistantText.trim(),
      durationMs: Date.now() - start,
      ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
      ...(cacheCreationTokens !== undefined ? { cacheCreationTokens } : {}),
      ...(inputTokens !== undefined ? { inputTokens } : {}),
    };
  }
}
