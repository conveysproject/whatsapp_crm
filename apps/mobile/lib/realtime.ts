import { io } from "socket.io-client";
import type { GetToken } from "./api";

/** Which TanStack Query keys a server event makes stale. */
export function queryKeysFor(event: string, payload: unknown): ReadonlyArray<readonly unknown[]> {
  const conversationId =
    payload && typeof payload === "object" && typeof (payload as { conversationId?: unknown }).conversationId === "string"
      ? (payload as { conversationId: string }).conversationId
      : null;
  switch (event) {
    case "new-message":
      return conversationId
        ? [["conversations"], ["unread-count"], ["messages", conversationId]]
        : [["conversations"], ["unread-count"]];
    case "conversation:assign":
    case "conversation:assigned":
    case "conversation:status":
      return [["conversations"], ["unread-count"]];
    case "notification":
      return [["notifications"], ["unread-count"]];
    case "message:status":
      // The server only sends the WhatsApp message id, so refresh every open thread.
      return [["messages"]];
    case "campaign:progress":
    case "campaign:completed":
    case "campaign:aborted":
    case "campaign:expired":
      return [["campaigns"], ["dashboard"]];
    default:
      return [];
  }
}

/** Foreground refresh must not refetch the session gate: a network blip would replace the cached `ok` gate with an error gate. */
export function isForegroundRefreshable(queryKey: readonly unknown[]): boolean {
  return queryKey[0] !== "gate";
}

const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 30_000;

/** Socket.IO connection that sends a fresh token on every handshake and retries after an auth rejection. */
export function connectRealtime(opts: {
  url: string;
  getToken: GetToken;
  onEvent: (event: string, payload: unknown) => void;
}): { disconnect(): void; ensureConnected(): void } {
  const socket = io(opts.url, { autoConnect: false, transports: ["websocket"] });
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  socket.auth = (cb: (data: { token: string | null }) => void) => {
    opts.getToken().then((token) => cb({ token }), () => cb({ token: null }));
  };

  const onConnect = () => { attempt = 0; };
  const onConnectError = (err: Error) => {
    if (stopped || err.message !== "unauthorized" || socket.active) return;
    if (timer) clearTimeout(timer);
    const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
    attempt += 1;
    timer = setTimeout(() => { timer = null; if (!stopped) socket.connect(); }, delay);
  };

  socket.on("connect", onConnect);
  socket.on("connect_error", onConnectError);
  socket.onAny((event: string, payload: unknown) => opts.onEvent(event, payload));
  socket.connect();

  return {
    disconnect() {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.offAny();
      socket.disconnect();
    },
    ensureConnected() {
      if (!stopped && !socket.connected) socket.connect();
    },
  };
}
