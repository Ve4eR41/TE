// Fixture kept outside the shipped entry point.
export const makeMap = () => ({
  id: "forest" as const,
  width: 960,
  height: 700,
  bounds: { left: 100, right: 870, top: 140, bottom: 640 },
  avatarRadius: 14,
  spawns: [
    { x: 160, y: 445 },
    { x: 570, y: 385 },
  ],
  trees: [],
  pond: { x: 765, y: 530, radiusX: 119, radiusY: 76 },
  obstacles: [{ x: 455, y: 305, radiusX: 55, radiusY: 46 }],
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeClientMessage } from "@troll-vs-elves/shared";
import {
  connectToServer,
  getWebSocketUrl,
  type ConnectionObserver,
} from "./connection.js";

const sockets = (() => [] as TestWebSocket[])();
class TestWebSocket extends EventTarget {
  static readonly OPEN = 1;
  readyState = 0;
  readonly sent: string[] = [];
  constructor(readonly url: string) {
    super();
    sockets.push(this);
  }
  send(text: string): void {
    this.sent.push(text);
  }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
  receive(value: unknown): void {
    this.readyState = 1;
    this.dispatchEvent(new MessageEvent("message", { data: value }));
  }
}
const makeObserver = () => ({
  onState: vi.fn<ConnectionObserver["onState"]>(),
  onLatency: vi.fn<ConnectionObserver["onLatency"]>(),
  onWelcome: vi.fn<ConnectionObserver["onWelcome"]>(),
});
const welcome = () =>
  JSON.stringify({
    v: 2,
    t: "welcome",
    playerId: "player",
    roomId: "room",
    map: makeMap(),
    match: {
      durationSeconds: 1800,
      tickRateHz: 20,
      phaseStartSeconds: [0, 600, 1200],
    },
  });
const latestSocket = (): TestWebSocket => {
  const socket = sockets.at(-1);
  if (!socket) throw new Error("No socket");
  return socket;
};
beforeEach(() => {
  sockets.length = 0;
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "performance",
    ],
  });
  vi.stubGlobal("WebSocket", TestWebSocket);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("browser connection lifecycle", () => {
  it("keeps the page origin and uses secure WebSocket for HTTPS", () => {
    expect(getWebSocketUrl("https://example.test/game?x=1")).toBe(
      "wss://example.test/ws",
    );
    expect(getWebSocketUrl("http://localhost:5173/")).toBe(
      "ws://localhost:5173/ws",
    );
  });
  it("starts one ping timer after welcome and correlates latency replies", () => {
    const observer = makeObserver();
    const disconnect = connectToServer("ws://test/ws", observer);
    const socket = latestSocket();
    socket.receive(welcome());
    expect(observer.onState).toHaveBeenLastCalledWith("connected");
    expect(observer.onWelcome).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    const ping = decodeClientMessage(socket.sent[0] ?? "");
    expect(ping?.t).toBe("ping");
    vi.advanceTimersByTime(25);
    socket.receive(JSON.stringify({ v: 2, t: "pong", requestId: "stale" }));
    expect(observer.onLatency).not.toHaveBeenCalled();
    socket.receive(
      JSON.stringify({ v: 2, t: "pong", requestId: ping?.requestId }),
    );
    expect(observer.onLatency).toHaveBeenCalledWith(25);
    socket.receive(welcome());
    expect(vi.getTimerCount()).toBe(1);
    disconnect();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels a pending connection and ignores late messages", () => {
    const observer = makeObserver();
    const disconnect = connectToServer("ws://test/ws", observer);
    disconnect();
    disconnect();
    latestSocket().receive(welcome());
    expect(observer.onWelcome).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(observer.onState).toHaveBeenLastCalledWith(
      "disconnected",
      expect.any(String),
    );
  });
  it("times out a handshake and closes the socket", () => {
    const observer = makeObserver();
    connectToServer("ws://test/ws", observer);
    vi.advanceTimersByTime(8000);
    expect(observer.onState).toHaveBeenLastCalledWith(
      "error",
      expect.any(String),
    );
    expect(latestSocket().readyState).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("detects a missing pong without sending unbounded pending pings", () => {
    const observer = makeObserver();
    connectToServer("ws://test/ws", observer);
    const socket = latestSocket();
    socket.receive(welcome());
    vi.advanceTimersByTime(8000);
    expect(socket.sent).toHaveLength(1);
    expect(observer.onState).toHaveBeenLastCalledWith(
      "error",
      expect.any(String),
    );
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["{", new ArrayBuffer(1)])(
    "closes malformed responses without overwriting the error",
    (value) => {
      const observer = makeObserver();
      connectToServer("ws://test/ws", observer);
      latestSocket().receive(value);
      expect(observer.onState).toHaveBeenLastCalledWith(
        "error",
        expect.any(String),
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("cleans timers when the server closes an established connection", () => {
    const observer = makeObserver();
    connectToServer("ws://test/ws", observer);
    latestSocket().receive(welcome());
    latestSocket().close();
    expect(observer.onState).toHaveBeenLastCalledWith(
      "disconnected",
      expect.any(String),
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});

it("sends intents only while welcomed and dispatches snapshots without predicting", () => {
  const observer = { ...makeObserver(), onSnapshot: vi.fn() };
  const connection = connectToServer("ws://test/ws", observer);
  const socket = latestSocket();
  expect(connection.sendIntent({ t: "move", x: 260, y: 445 })).toBe(false);
  socket.receive(welcome());
  expect(connection.sendIntent({ t: "move", x: 260, y: 445 })).toBe(true);
  expect(decodeClientMessage(socket.sent.at(-1) ?? "")).toMatchObject({
    t: "intent",
    intent: { t: "move", x: 260, y: 445 },
  });
  const snapshot = {
    v: 2,
    t: "snapshot",
    tick: 1,
    entities: [],
    resources: { gold: 0, wood: 0, rage: 0 },
    phase: 1,
    timeLeftSeconds: 1799,
  };
  socket.receive(JSON.stringify(snapshot));
  expect(observer.onSnapshot).toHaveBeenCalledWith(snapshot);
  connection();
  expect(connection.sendIntent({ t: "steer", x: 0, y: 0 })).toBe(false);
});

it("keeps an established connection after a rejected movement target", () => {
  const observer = { ...makeObserver(), onRejection: vi.fn() };
  const connection = connectToServer("ws://test/ws", observer);
  const socket = latestSocket();
  socket.receive(welcome());
  socket.receive(
    JSON.stringify({
      v: 2,
      t: "error",
      code: "INVALID_TARGET",
      requestId: "move-1",
    }),
  );
  expect(observer.onRejection).toHaveBeenCalledOnce();
  expect(observer.onState).toHaveBeenLastCalledWith("connected");
  expect(connection.sendIntent({ t: "move", x: 260, y: 445 })).toBe(true);
  connection();
});
