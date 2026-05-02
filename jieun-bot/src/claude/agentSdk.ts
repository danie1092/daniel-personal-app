import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeAdapter, ClaudeCallInput, ClaudeCallResult } from "./adapter.js";

export class AgentSdkClaude implements ClaudeAdapter {
  async ask(input: ClaudeCallInput): Promise<ClaudeCallResult> {
    const start = Date.now();
    let text = "";

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
        for (const block of msg.message.content) {
          if (block.type === "text" && "text" in block) {
            text += (block as { text: string }).text;
          }
        }
      }
      if (msg.type === "result" && msg.subtype !== "success") {
        throw new Error(`claude error: ${msg.subtype} — ${JSON.stringify(msg).slice(0, 200)}`);
      }
    }

    return { text: text.trim(), durationMs: Date.now() - start };
  }
}
