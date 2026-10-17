type Listener = (sessionIds: string[]) => void;

const listeners = new Set<Listener>();

/** Subscribe to session revocations. Returns an unsubscribe function. */
export function onSessionsRevoked(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tell subscribers which sessions were just revoked. Listener errors never reach the caller. */
export function emitSessionsRevoked(sessionIds: string[]): void {
  if (sessionIds.length === 0) return;
  for (const l of [...listeners]) {
    try {
      l(sessionIds);
    } catch (err) {
      console.warn("auth: session revoke listener failed", err instanceof Error ? err.name : "unknown");
    }
  }
}

export function resetSessionListenersForTests(): void {
  listeners.clear();
}
