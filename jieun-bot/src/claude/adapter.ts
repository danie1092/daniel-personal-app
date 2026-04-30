export type ClaudeCallInput = {
  systemPrompt: string;
  userPrompt: string;
};

export type ClaudeCallResult = {
  text: string;             // 발화 텍스트 (빈 문자열이면 침묵)
  durationMs: number;
};

export interface ClaudeAdapter {
  ask(input: ClaudeCallInput): Promise<ClaudeCallResult>;
}
