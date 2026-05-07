export type ClaudeCallInput = {
  systemPrompt: string;
  userPrompt: string;
};

export type ClaudeCallResult = {
  text: string;             // 발화 텍스트 (빈 문자열이면 침묵)
  durationMs: number;
  // prompt cache 통계 (Agent SDK가 자동 caching). 0이면 모름/캐시 없음.
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  inputTokens?: number;
};

export interface ClaudeAdapter {
  ask(input: ClaudeCallInput): Promise<ClaudeCallResult>;
}
