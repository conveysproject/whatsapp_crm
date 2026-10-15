// apps/mobile/lib/realtime.test.ts
import { connectRealtime, isForegroundRefreshable, queryKeysFor } from "./realtime";

type Handler = (...args: unknown[]) => void;
const mockHandlers: Record<string, Handler[]> = {};
let mockAnyHandler: Handler | null = null;
const mockSocket = {
  active: true,
  connected: false,
  auth: undefined as unknown,
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn((ev: string, h: Handler) => { (mockHandlers[ev] ??= []).push(h); }),
  off: jest.fn(),
  onAny: jest.fn((h: Handler) => { mockAnyHandler = h; }),
  offAny: jest.fn(),
};
jest.mock("socket.io-client", () => ({ io: jest.fn(() => mockSocket) }));

beforeEach(() => {
  jest.useFakeTimers();
  for (const k of Object.keys(mockHandlers)) delete mockHandlers[k];
  mockAnyHandler = null;
  jest.clearAllMocks();
  mockSocket.active = true;
  mockSocket.connected = false;
});
afterEach(() => jest.useRealTimers());

describe("queryKeysFor", () => {
  it("refreshes campaign data on campaign events", () => {
    for (const ev of ["campaign:progress", "campaign:completed", "campaign:aborted", "campaign:expired"]) {
      expect(queryKeysFor(ev, { campaignId: "k-1" })).toEqual([["campaigns"], ["dashboard"]]);
    }
  });
  it("refreshes open threads on delivery status changes", () => {
    expect(queryKeysFor("message:status", { whatsappMessageId: "wamid.1", status: "read" })).toEqual([["messages"]]);
  });
  it("maps a new message to the list, the thread and the badge", () => {
    expect(queryKeysFor("new-message", { conversationId: "c-1" })).toEqual([["conversations"], ["unread-count"], ["messages", "c-1"]]);
  });
  it("maps assignment and status changes to the list and the badge", () => {
    for (const ev of ["conversation:assign", "conversation:assigned", "conversation:status"]) {
      expect(queryKeysFor(ev, { conversationId: "c-1" })).toEqual([["conversations"], ["unread-count"]]);
    }
  });
  it("maps notifications to the feed and the badge", () => {
    expect(queryKeysFor("notification", {})).toEqual([["notifications"], ["unread-count"]]);
  });
  it("ignores unknown events and bad payloads", () => {
    expect(queryKeysFor("typing:start", {})).toEqual([]);
    expect(queryKeysFor("new-message", null)).toEqual([["conversations"], ["unread-count"]]);
  });
});

describe("connectRealtime", () => {
  it("fetches a fresh token for every handshake", async () => {
    const getToken = jest.fn().mockResolvedValueOnce("t1").mockResolvedValueOnce("t2");
    connectRealtime({ url: "https://api.test", getToken, onEvent: jest.fn() });
    const auth = mockSocket.auth as (cb: (d: { token: string | null }) => void) => void;
    const first = await new Promise((r) => auth(r));
    const second = await new Promise((r) => auth(r));
    expect(first).toEqual({ token: "t1" });
    expect(second).toEqual({ token: "t2" });
  });

  it("passes a null token when Clerk fails instead of hanging", async () => {
    connectRealtime({ url: "https://api.test", getToken: jest.fn().mockRejectedValue(new Error("x")), onEvent: jest.fn() });
    const auth = mockSocket.auth as (cb: (d: { token: string | null }) => void) => void;
    await expect(new Promise((r) => auth(r))).resolves.toEqual({ token: null });
  });

  it("forwards every event", () => {
    const onEvent = jest.fn();
    connectRealtime({ url: "https://api.test", getToken: async () => "t", onEvent });
    mockAnyHandler?.("new-message", { conversationId: "c-1" });
    expect(onEvent).toHaveBeenCalledWith("new-message", { conversationId: "c-1" });
  });

  it("retries with backoff after an auth rejection and stops after disconnect", () => {
    const rt = connectRealtime({ url: "https://api.test", getToken: async () => "t", onEvent: jest.fn() });
    mockSocket.active = false;
    mockHandlers["connect_error"]?.[0]?.(new Error("unauthorized"));
    jest.advanceTimersByTime(1999);
    expect(mockSocket.connect).toHaveBeenCalledTimes(1); // initial connect only
    jest.advanceTimersByTime(1);
    expect(mockSocket.connect).toHaveBeenCalledTimes(2);
    rt.disconnect();
    mockHandlers["connect_error"]?.[0]?.(new Error("unauthorized"));
    jest.advanceTimersByTime(60_000);
    expect(mockSocket.connect).toHaveBeenCalledTimes(2);
  });
});

describe("isForegroundRefreshable", () => {
  it("keeps the session gate out of the foreground refresh", () => {
    expect(isForegroundRefreshable(["gate", "u-1"])).toBe(false);
    for (const key of [["conversations"], ["messages", "c-1"], ["unread-count"], ["notifications"]]) {
      expect(isForegroundRefreshable(key)).toBe(true);
    }
  });
});
