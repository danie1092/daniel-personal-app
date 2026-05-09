const TTL_MS = 5 * 60 * 1000;

export type RoutineChangePending = {
  change: "add" | "remove";
  name: string;
  time_slot: string;
  reason: string;
  proposedAt: number;
};

export type RoutineChangeInput = Omit<RoutineChangePending, "proposedAt">;

const map = new Map<number, RoutineChangePending>();

export function setRoutinePending(chatId: number, input: RoutineChangeInput): void {
  map.set(chatId, { ...input, proposedAt: Date.now() });
}

export function getRoutinePending(chatId: number): RoutineChangePending | null {
  const p = map.get(chatId);
  if (!p) return null;
  if (Date.now() - p.proposedAt > TTL_MS) {
    map.delete(chatId);
    return null;
  }
  return p;
}

export function clearRoutinePending(chatId: number): void {
  map.delete(chatId);
}

export const __test = {
  clearAll: () => map.clear(),
};
