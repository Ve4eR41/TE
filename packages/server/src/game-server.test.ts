import { once } from "node:events";
import { fileURLToPath } from "node:url";
import {
  decodeServerMessage,
  MAX_BUFFERED_BYTES,
  MAX_MESSAGE_BYTES,
  MAX_MESSAGES_PER_WINDOW,
  type ServerMessage,
} from "@troll-vs-elves/shared";
import { loadConfig, loadMap } from "@troll-vs-elves/shared/config/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { startGameServer } from "./game-server.js";

let server: Awaited<ReturnType<typeof startGameServer>>;
let baseUrl: string;

beforeEach(async () => {
  const config = loadConfig(
    fileURLToPath(new URL("../../../config/", import.meta.url)),
  );
  server = await startGameServer({
    config,
    map: loadMap(fileURLToPath(new URL("../../../config/", import.meta.url))),
    port: 0,
  });
  const address = server.httpServer.address();
  if (!address || typeof address === "string")
    throw new Error("No TCP address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  await server?.stop();
  vi.restoreAllMocks();
});

const connect = async (includeSnapshots = false) => {
  const socket = new WebSocket(baseUrl.replace("http:", "ws:") + "/ws");
  const queued: ServerMessage[] = [];
  const waiting: ((message: ServerMessage) => void)[] = [];
  socket.on("message", (data) => {
    const message = decodeServerMessage(data.toString());
    expect(message).not.toBeNull();
    if (!message || (message.t === "snapshot" && !includeSnapshots)) return;
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else queued.push(message);
  });
  await once(socket, "open");
  const next = (): Promise<ServerMessage> => {
    const message = queued.shift();
    return message
      ? Promise.resolve(message)
      : new Promise((resolve) => waiting.push(resolve));
  };
  return { socket, next };
};

describe("WS game server", () => {
  it("streams authoritative snapshots after welcome", async () => {
    const client = await connect(true);
    expect((await client.next()).t).toBe("welcome");
    expect(await client.next()).toMatchObject({ t: "snapshot", phase: 1 });
  });
  it("serves health and rejects unknown HTTP routes/methods", async () => {
    expect(await (await fetch(baseUrl + "/health")).json()).toEqual({
      status: "ok",
      connections: 0,
    });
    expect((await fetch(baseUrl + "/unknown")).status).toBe(404);
    expect((await fetch(baseUrl + "/health", { method: "POST" })).status).toBe(
      404,
    );
  });

  it("sends welcome and responds to ping with matching requestId", async () => {
    const client = await connect();
    expect(await client.next()).toMatchObject({
      t: "welcome",
      v: 2,
      roomId: server.room.id,
    });
    client.socket.send(
      JSON.stringify({ v: 2, t: "ping", requestId: "latency-1" }),
    );
    expect(await client.next()).toEqual({
      v: 2,
      t: "pong",
      requestId: "latency-1",
    });
    expect(server.room.size).toBe(1);
  });

  it("returns safe errors for malformed data and unimplemented actions", async () => {
    const client = await connect();
    await client.next();
    client.socket.send('{"private-marker":');
    expect(await client.next()).toEqual({
      v: 2,
      t: "error",
      code: "INVALID_MESSAGE",
    });
    client.socket.send(
      JSON.stringify({
        v: 2,
        t: "intent",
        requestId: "move-1",
        intent: { t: "move", x: 1, y: 2 },
      }),
    );
    expect(await client.next()).toEqual({
      v: 2,
      t: "error",
      code: "UNSUPPORTED_INTENT",
      requestId: "move-1",
    });
  });

  it("closes binary data with code 1003", async () => {
    const client = await connect();
    await client.next();
    const closed = once(client.socket, "close");
    client.socket.send(Buffer.from("binary"));
    expect((await closed)[0]).toBe(1003);
  });

  it("accounts for the next message before exceeding the outgoing buffer limit", async () => {
    const client = await connect();
    await client.next();
    vi.spyOn(WebSocket.prototype, "bufferedAmount", "get").mockReturnValue(
      MAX_BUFFERED_BYTES - 1,
    );
    const closed = once(client.socket, "close");
    client.socket.send(
      JSON.stringify({ v: 2, t: "ping", requestId: "backpressure" }),
    );
    expect((await closed)[0]).toBe(1013);
  });

  it("closes oversized frames with code 1009", async () => {
    const client = await connect();
    await client.next();
    const closed = once(client.socket, "close");
    client.socket.send("x".repeat(MAX_MESSAGE_BYTES + 1));
    expect((await closed)[0]).toBe(1009);
  });

  it("limits message rate and closes with code 1008", async () => {
    const client = await connect();
    await client.next();
    const closed = once(client.socket, "close");
    for (let index = 0; index <= MAX_MESSAGES_PER_WINDOW; index += 1) {
      client.socket.send(
        JSON.stringify({ v: 2, t: "ping", requestId: String(index) }),
      );
    }
    for (let index = 0; index < MAX_MESSAGES_PER_WINDOW; index += 1) {
      expect((await client.next()).t).toBe("pong");
    }
    expect(await client.next()).toEqual({
      v: 2,
      t: "error",
      code: "RATE_LIMITED",
    });
    expect((await closed)[0]).toBe(1008);
  });

  it("cleans up disconnects and assigns a fresh identity on reconnect", async () => {
    const first = await connect();
    const initial = await first.next();
    const closed = once(first.socket, "close");
    first.socket.close();
    await closed;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(server.room.size).toBe(0);
    const second = await connect();
    const next = await second.next();
    expect(initial.t).toBe("welcome");
    expect(next.t).toBe("welcome");
    if (initial.t === "welcome" && next.t === "welcome") {
      expect(initial.playerId).not.toBe(next.playerId);
      expect(initial.roomId).toBe(next.roomId);
    }
  });

  it("rejects upgrade paths other than /ws", async () => {
    const socket = new WebSocket(baseUrl.replace("http:", "ws:") + "/wrong");
    await expect(once(socket, "open")).rejects.toThrow("404");
  });

  it("closes clients and allows repeated shutdown", async () => {
    const client = await connect();
    await client.next();
    const closed = once(client.socket, "close");
    await server.stop();
    await server.stop();
    await closed;
    expect(server.httpServer.listening).toBe(false);
    expect(server.room.size).toBe(0);
  });

  it("rejects startup on an occupied port", async () => {
    const address = server.httpServer.address();
    if (!address || typeof address === "string") throw new Error("No address");
    await expect(
      startGameServer({
        config: {
          match: server.room.match,
          units: [],
          buildings: [],
          items: [],
          classes: [],
          abilities: [],
        },
        port: address.port,
        map: server.room.map,
      }),
    ).rejects.toMatchObject({ code: "EADDRINUSE" });
  });
});
