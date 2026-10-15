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

const connect = async (includeSnapshots = false, team?: "troll" | "elves") => {
  const socket = new WebSocket(
    baseUrl.replace("http:", "ws:") + "/ws" + (team ? `?team=${team}` : ""),
  );
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
  it("synchronizes movement for two players and removes disconnected entities", async () => {
    const first = await connect(true);
    const firstWelcome = await first.next();
    const second = await connect(true);
    const secondWelcome = await second.next();
    if (firstWelcome.t !== "welcome" || secondWelcome.t !== "welcome")
      throw new Error("Missing welcome");
    first.socket.send(
      JSON.stringify({
        v: 5,
        t: "intent",
        requestId: "walk",
        intent: { t: "move", x: 260, y: 445 },
      }),
    );
    let observed = false;
    for (let index = 0; index < 20; index += 1) {
      const message = await second.next();
      if (message.t !== "snapshot") continue;
      const troll = message.entities.find(
        ({ ownerId }) => ownerId === firstWelcome.playerId,
      );
      const elf = message.entities.find(
        ({ ownerId }) => ownerId === secondWelcome.playerId,
      );
      if (troll && troll.position.x > 160) {
        expect(elf?.position).toEqual(secondWelcome.map.spawns[1]);
        expect(troll.position.x).toBeLessThanOrEqual(260);
        observed = true;
        break;
      }
    }
    expect(observed).toBe(true);
    const closed = once(first.socket, "close");
    first.socket.close();
    await closed;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(
      server.room.snapshot().entities.map(({ ownerId }) => ownerId),
    ).toEqual([secondWelcome.playerId]);
  });

  it("rejects excess players without creating an extra entity", async () => {
    for (let index = 0; index < server.room.map.spawns.length; index += 1) {
      const client = await connect();
      await client.next();
    }
    const excess = await connect();
    expect(await excess.next()).toMatchObject({
      t: "error",
      code: "ROOM_FULL",
    });
    expect(server.room.size).toBe(server.room.map.spawns.length);
    expect(server.room.snapshot().entities).toHaveLength(
      server.room.map.spawns.length,
    );
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
      v: 5,
      roomId: server.room.id,
    });
    client.socket.send(
      JSON.stringify({ v: 5, t: "ping", requestId: "latency-1" }),
    );
    expect(await client.next()).toEqual({
      v: 5,
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
      v: 5,
      t: "error",
      code: "INVALID_MESSAGE",
    });
    client.socket.send(
      JSON.stringify({
        v: 5,
        t: "intent",
        requestId: "move-1",
        intent: { t: "buy", itemId: "unit" },
      }),
    );
    expect(await client.next()).toEqual({
      v: 5,
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
      JSON.stringify({ v: 5, t: "ping", requestId: "backpressure" }),
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
        JSON.stringify({ v: 5, t: "ping", requestId: String(index) }),
      );
    }
    for (let index = 0; index < MAX_MESSAGES_PER_WINDOW; index += 1) {
      expect((await client.next()).t).toBe("pong");
    }
    expect(await client.next()).toEqual({
      v: 5,
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
          economy: server.room.economy,
          units: [...server.room.units],
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

it("allows an elf first and rejects a second explicit troll", async () => {
  const elf = await connect(true, "elves");
  const welcome = await elf.next();
  expect(welcome.t).toBe("welcome");
  const snapshot = await elf.next();
  expect(snapshot).toMatchObject({ t: "snapshot", resources: { rage: 0 } });
  if (snapshot.t === "snapshot")
    expect(snapshot.resources.gold).toBeGreaterThanOrEqual(120);
  const troll = await connect(false, "troll");
  expect((await troll.next()).t).toBe("welcome");
  const excess = await connect(false, "troll");
  expect(await excess.next()).toMatchObject({ t: "error", code: "ROLE_TAKEN" });
  expect(server.room.size).toBe(2);
});
it.each(["?team=invalid", "?team=elves&team=troll", "?unknown=1"])(
  "rejects invalid role query %s",
  async (query) => {
    const socket = new WebSocket(
      baseUrl.replace("http:", "ws:") + "/ws" + query,
    );
    await expect(once(socket, "open")).rejects.toThrow("400");
  },
);

it("rejects malformed upgrade URLs without stopping the server", async () => {
  const socket = new WebSocket(baseUrl.replace("http:", "ws:") + "//[");
  await expect(once(socket, "open")).rejects.toThrow("400");
  expect((await fetch(baseUrl + "/health")).status).toBe(200);
});

it("broadcasts constructed and upgraded walls while keeping wallets private", async () => {
  const elf = await connect(true, "elves");
  const welcome = await elf.next();
  if (welcome.t !== "welcome") throw new Error("Missing welcome");
  expect(welcome.buildingDefinitions[0]?.id).toBe("wall");
  const troll = await connect(true, "troll");
  await troll.next();
  elf.socket.send(
    JSON.stringify({
      v: 5,
      t: "intent",
      requestId: "wall-1",
      intent: { t: "build", buildingId: "wall", x: 220, y: 445 },
    }),
  );
  let wallId: string | undefined;
  for (let i = 0; i < 20; i += 1) {
    const snapshot = await troll.next();
    if (snapshot.t !== "snapshot" || !snapshot.buildings.length) continue;
    expect(snapshot.resources.gold).toBe(0);
    expect(snapshot.resources.wood).toBe(0);
    expect(snapshot.resources.rage).toBeGreaterThanOrEqual(60);
    wallId = snapshot.buildings[0]?.id;
    expect(snapshot.buildings[0]?.ownerId).toBe(welcome.playerId);
    break;
  }
  expect(wallId).toBeDefined();
  elf.socket.send(
    JSON.stringify({
      v: 5,
      t: "intent",
      requestId: "upgrade-1",
      intent: { t: "upgrade", entityId: wallId },
    }),
  );
  let upgraded = false;
  for (let i = 0; i < 20; i += 1) {
    const snapshot = await troll.next();
    if (snapshot.t === "snapshot" && snapshot.buildings[0]?.level === 2) {
      upgraded = true;
      break;
    }
  }
  expect(upgraded).toBe(true);
});

it("shares hired guards with both clients, rejects troll hire and removes departed owner's guards", async () => {
  const elf = await connect(true, "elves");
  const welcome = await elf.next();
  if (welcome.t !== "welcome") throw new Error("Missing welcome");
  expect(welcome.unitDefinitions.map(({ id }) => id)).toEqual(["guard"]);
  const troll = await connect(true, "troll");
  await troll.next();
  const sendHire = (client: typeof elf, requestId: string) =>
    client.socket.send(
      JSON.stringify({
        v: 5,
        t: "intent",
        requestId,
        intent: { t: "hire", unitId: "guard" },
      }),
    );
  sendHire(elf, "hire-1");
  for (const client of [elf, troll]) {
    let visible = false;
    for (let i = 0; i < 30; i++) {
      const message = await client.next();
      if (message.t !== "snapshot" || !message.units.length) continue;
      expect(message.entities).toHaveLength(2);
      expect(message.units[0]).toMatchObject({
        ownerId: welcome.playerId,
        unitId: "guard",
      });
      if (client === elf) expect(message.resources.gold).toBeLessThan(90);
      else expect(message.resources.gold).toBe(0);
      visible = true;
      break;
    }
    expect(visible).toBe(true);
  }
  sendHire(troll, "forbidden-hire");
  let rejected = false;
  for (let i = 0; i < 30; i++) {
    const message = await troll.next();
    if (message.t === "error") {
      expect(message).toMatchObject({
        code: "ACTION_FORBIDDEN",
        requestId: "forbidden-hire",
      });
      rejected = true;
      break;
    }
  }
  expect(rejected).toBe(true);
  const closed = once(elf.socket, "close");
  elf.socket.close();
  await closed;
  let removed = false;
  for (let i = 0; i < 30; i++) {
    const message = await troll.next();
    if (message.t === "snapshot" && message.entities.length === 1) {
      expect(message.units).toEqual([]);
      removed = true;
      break;
    }
  }
  expect(removed).toBe(true);
});

it("publishes town halls and troll levels to both clients while keeping upgrade wallets private", async () => {
  const elf = await connect(true, "elves");
  const welcome = await elf.next();
  if (welcome.t !== "welcome") throw new Error("No welcome");
  expect(
    welcome.buildingDefinitions.find(({ id }) => id === "town-hall")
      ?.incomePerSecond?.gold,
  ).toBe(2);
  const troll = await connect(true, "troll");
  const trollWelcome = await troll.next();
  if (trollWelcome.t !== "welcome") throw new Error("No welcome");
  expect(
    trollWelcome.heroDefinitions.find(({ id }) => id === "troll")?.progression,
  ).toHaveLength(3);
  elf.socket.send(
    JSON.stringify({
      v: 5,
      t: "intent",
      requestId: "hall",
      intent: { t: "build", buildingId: "town-hall", x: 250, y: 445 },
    }),
  );
  troll.socket.send(
    JSON.stringify({
      v: 5,
      t: "intent",
      requestId: "level",
      intent: { t: "upgrade", entityId: trollWelcome.playerId },
    }),
  );
  for (const client of [elf, troll]) {
    let visible = false;
    for (let i = 0; i < 30; i++) {
      const snapshot = await client.next();
      if (snapshot.t !== "snapshot" || !snapshot.buildings.length) continue;
      const hero = snapshot.entities.find(
        ({ id }) => id === trollWelcome.playerId,
      );
      if (hero?.level !== 2) continue;
      expect(hero).toMatchObject({ hp: 150, speedUnitsPerSecond: 155 });
      expect(snapshot.buildings[0]?.buildingId).toBe("town-hall");
      if (client === elf) expect(snapshot.resources.rage).toBe(0);
      else expect(snapshot.resources.rage).toBeLessThan(40);
      visible = true;
      break;
    }
    expect(visible).toBe(true);
  }
});
