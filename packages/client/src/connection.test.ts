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

import { connectWithRetry } from "./reconnecting-connection.js";

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
    v: 4,
    t: "welcome",
    playerId: "player",
    roomId: "room",
    map: makeMap(),
    buildingDefinitions: [],
    unitDefinitions: [],
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
    socket.receive(JSON.stringify({ v: 4, t: "pong", requestId: "stale" }));
    expect(observer.onLatency).not.toHaveBeenCalled();
    socket.receive(
      JSON.stringify({ v: 4, t: "pong", requestId: ping?.requestId }),
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
      true,
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
      true,
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
      true,
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
    v: 4,
    t: "snapshot",
    tick: 1,
    entities: [],
    buildings: [],
    units: [],
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
      v: 4,
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

it("sends the selected hero in the WebSocket URL without copying page parameters", () => {
  expect(
    getWebSocketUrl("https://example.test/game?unrelated=1", "elves"),
  ).toBe("wss://example.test/ws?team=elves");
  expect(getWebSocketUrl("http://localhost:5173/", "troll")).toBe(
    "ws://localhost:5173/ws?team=troll",
  );
});

it("explains when the troll role is already taken", () => {
  const observer = makeObserver();
  connectToServer("ws://test/ws?team=troll", observer);
  latestSocket().receive(
    JSON.stringify({ v: 4, t: "error", code: "ROLE_TAKEN" }),
  );
  expect(observer.onState).toHaveBeenLastCalledWith(
    "error",
    "Тролль уже в лесу. Выберите эльфа.",
  );
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  "ACTION_FORBIDDEN",
  "INVALID_UNIT",
  "UNIT_LIMIT_REACHED",
  "SPAWN_BLOCKED",
  "INSUFFICIENT_RESOURCES",
  "BUILD_LIMIT_REACHED",
  "MATCH_ENDED",
  "INVALID_BUILDING",
  "NOT_OWNER",
  "MAX_LEVEL",
  "OUT_OF_RANGE",
])("keeps gameplay rejection %s nonfatal", (code) => {
  const observer = { ...makeObserver(), onRejection: vi.fn() };
  const connection = connectToServer("ws://test/ws", observer);
  const socket = latestSocket();
  socket.receive(welcome());
  socket.receive(
    JSON.stringify({ v: 4, t: "error", code, requestId: "build-1" }),
  );
  expect(observer.onRejection).toHaveBeenCalledWith(expect.any(String));
  expect(observer.onState).toHaveBeenLastCalledWith("connected");
  expect(connection.sendIntent({ t: "move", x: 260, y: 445 })).toBe(true);
  connection();
});

describe("reconnecting transport", () => {
  it("caps retry delay and creates only one socket for each attempt", () => {
    const observer = makeObserver();
    const connection = connectWithRetry("ws://test/ws?team=elves", observer);
    for (const delay of [2000, 4000, 8000, 10000, 10000]) {
      const count = sockets.length;
      latestSocket().dispatchEvent(new Event("error"));
      expect(observer.onState).toHaveBeenLastCalledWith(
        "retrying",
        expect.stringContaining(`${delay / 1000} с`),
      );
      expect(vi.getTimerCount()).toBe(1);
      expect(connection.sendIntent({ t: "move", x: 200, y: 445 })).toBe(false);
      vi.advanceTimersByTime(delay - 1);
      expect(sockets).toHaveLength(count);
      vi.advanceTimersByTime(1);
      expect(sockets).toHaveLength(count + 1);
      expect(latestSocket().url).toBe("ws://test/ws?team=elves");
    }
    connection();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejoins after a server close and sends to the new socket only", () => {
    const observer = { ...makeObserver(), onSnapshot: vi.fn() };
    const connection = connectWithRetry("ws://test/ws", observer);
    const first = latestSocket();
    first.receive(welcome());
    first.close();
    vi.advanceTimersByTime(2000);
    const second = latestSocket();
    second.receive(welcome());
    expect(observer.onWelcome).toHaveBeenCalledTimes(2);
    expect(observer.onState).toHaveBeenLastCalledWith(
      "connected",
      expect.stringContaining("Связь восстановлена"),
    );
    expect(connection.sendIntent({ t: "move", x: 200, y: 445 })).toBe(true);
    expect(first.sent).toHaveLength(1);
    expect(decodeClientMessage(second.sent.at(-1) ?? "")).toMatchObject({
      t: "intent",
    });
    first.receive(welcome());
    expect(observer.onWelcome).toHaveBeenCalledTimes(2);
    second.close();
    vi.advanceTimersByTime(2000);
    expect(sockets).toHaveLength(3); // A successful welcome resets backoff.
    connection();
  });

  it("cancels a scheduled retry and makes repeated cancellation harmless", () => {
    const observer = makeObserver();
    const connection = connectWithRetry("ws://test/ws", observer);
    latestSocket().dispatchEvent(new Event("error"));
    connection();
    connection();
    vi.advanceTimersByTime(60000);
    expect(sockets).toHaveLength(1);
    expect(observer.onState).toHaveBeenLastCalledWith(
      "disconnected",
      "Вы вышли из леса",
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels an in-flight retry, including its handshake timeout", () => {
    const observer = makeObserver();
    const connection = connectWithRetry("ws://test/ws", observer);
    latestSocket().dispatchEvent(new Event("error"));
    vi.advanceTimersByTime(2000);
    connection();
    latestSocket().receive(welcome());
    vi.advanceTimersByTime(60000);
    expect(observer.onWelcome).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["ROLE_TAKEN", "ROOM_FULL", "RATE_LIMITED", "INVALID_MESSAGE"])(
    "does not retry application error %s",
    (code) => {
      const observer = makeObserver();
      connectWithRetry("ws://test/ws", observer);
      latestSocket().receive(JSON.stringify({ v: 4, t: "error", code }));
      vi.advanceTimersByTime(60000);
      expect(sockets).toHaveLength(1);
      expect(observer.onState).toHaveBeenLastCalledWith(
        "error",
        expect.any(String),
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("does not retry a malformed protocol message", () => {
    connectWithRetry("ws://test/ws", makeObserver());
    latestSocket().receive("{");
    vi.advanceTimersByTime(60000);
    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["welcome", "pong"])("retries a missing %s", (missing) => {
    const observer = makeObserver();
    const connection = connectWithRetry("ws://test/ws", observer);
    if (missing === "pong") latestSocket().receive(welcome());
    vi.advanceTimersByTime(8000);
    expect(observer.onState).toHaveBeenLastCalledWith(
      "retrying",
      expect.any(String),
    );
    vi.advanceTimersByTime(2000);
    expect(sockets).toHaveLength(2);
    connection();
  });
});
