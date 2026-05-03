const TTL_MS = 5 * 60 * 1000;

export type Pending =
  | { kind: "register"; title: string; start: string; end: string; proposedAt: number }
  | { kind: "delete"; targetUid: string; display: string; proposedAt: number };

export type PendingInput =
  | { kind: "register"; title: string; start: string; end: string }
  | { kind: "delete"; targetUid: string; display: string };

const map = new Map<number, Pending>();

export function setPending(chatId: number, input: PendingInput): void {
  const proposedAt = Date.now();
  if (input.kind === "register") {
    map.set(chatId, { ...input, proposedAt });
  } else {
    map.set(chatId, { ...input, proposedAt });
  }
}

export function getPending(chatId: number): Pending | null {
  const p = map.get(chatId);
  if (!p) return null;
  if (Date.now() - p.proposedAt > TTL_MS) {
    map.delete(chatId);
    return null;
  }
  return p;
}

export function clearPending(chatId: number): void {
  map.delete(chatId);
}

export const __test = {
  clearAll: () => map.clear(),
};
