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

import { describe, expect, it } from "vitest";
import {
  MAX_IDENTIFIER_LENGTH,
  MAX_MESSAGE_BYTES,
  MAX_SNAPSHOT_ENTITIES,
} from "./constants.js";
import {
  clientMessageSchema,
  decodeClientMessage,
  decodeServerMessage,
  entitySchema,
  intentSchema,
  snapshotSchema,
} from "./protocol.js";

const makeEntity = () => ({
  id: "entity",
  ownerId: "player",
  team: "elves",
  position: { x: 1, y: 2 },
  hp: 10,
  maxHp: 10,
});
const makeSnapshot = () => ({
  tick: 0,
  entities: [{ ...makeEntity(), level: 1, speedUnitsPerSecond: 145 }],
  buildings: [],
  units: [],
  resources: { gold: 0, wood: 0, rage: 0 },
  phase: 1,
  timeLeftSeconds: 1800,
});

describe("protocol v5", () => {
  it.each([
    { t: "move", x: 1, y: -2 },
    { t: "steer", x: 1, y: 0 },
    { t: "build", buildingId: "wall", x: 1, y: 2 },
    { t: "hire", unitId: "scout" },
    { t: "upgrade", entityId: "entity" },
    { t: "ability", abilityId: "roar" },
    { t: "ability", abilityId: "roar", target: "entity" },
    { t: "buy", itemId: "sword" },
    { t: "subclass", id: "warrior" },
  ])("validates intent %j", (intent) => {
    expect(intentSchema.parse(intent)).toEqual(intent);
    const message = { v: 5, t: "intent", requestId: "request", intent };
    expect(decodeClientMessage(JSON.stringify(message))).toEqual(message);
  });

  it("decodes ping and every server message", () => {
    const ping = { v: 5, t: "ping", requestId: "request" };
    expect(decodeClientMessage(JSON.stringify(ping))).toEqual(ping);
    const messages = [
      {
        v: 5,
        t: "welcome",
        playerId: "player",
        roomId: "room",
        map: makeMap(),
        buildingDefinitions: [],
        unitDefinitions: [],
        heroDefinitions: [],
        match: {
          durationSeconds: 1800,
          tickRateHz: 20,
          phaseStartSeconds: [0, 600, 1200],
        },
      },
      { v: 5, t: "pong", requestId: "request" },
      { v: 5, t: "error", code: "INVALID_MESSAGE" },
      { v: 5, t: "error", code: "UNSUPPORTED_INTENT", requestId: "request" },
      { v: 5, t: "error", code: "RATE_LIMITED" },
      { v: 5, t: "snapshot", ...makeSnapshot() },
    ];
    for (const message of messages)
      expect(decodeServerMessage(JSON.stringify(message))).toEqual(message);
  });

  it.each([
    "{",
    "null",
    "[]",
    '"text"',
    '{"v":4,"t":"ping","requestId":"r"}',
    '{"v":5,"t":"unknown"}',
    '{"v":5,"t":"ping","requestId":"r","damage":100}',
  ])("rejects invalid client data %s", (text) =>
    expect(decodeClientMessage(text)).toBeNull(),
  );

  it.each(["", " id", "id ", "x".repeat(MAX_IDENTIFIER_LENGTH + 1)])(
    "rejects ID %j",
    (requestId) => {
      expect(
        clientMessageSchema.safeParse({ v: 5, t: "ping", requestId }).success,
      ).toBe(false);
    },
  );

  it.each([NaN, Infinity, -Infinity])(
    "rejects non-finite coordinates %s",
    (x) => {
      expect(intentSchema.safeParse({ t: "move", x, y: 0 }).success).toBe(
        false,
      );
    },
  );

  it("rejects a supplied player identity or unknown intent field", () => {
    expect(
      intentSchema.safeParse({ t: "move", x: 0, y: 0, playerId: "victim" })
        .success,
    ).toBe(false);
  });

  it("uses UTF-8 byte size limits and rejects oversized server data", () => {
    const text = JSON.stringify({ v: 5, t: "ping", requestId: "id" });
    expect(
      decodeClientMessage(text + " ".repeat(MAX_MESSAGE_BYTES - text.length)),
    ).not.toBeNull();
    expect(
      decodeClientMessage(text + " ".repeat(MAX_MESSAGE_BYTES)),
    ).toBeNull();
    expect(
      decodeClientMessage('"' + "🌲".repeat(MAX_MESSAGE_BYTES / 4) + '"'),
    ).toBeNull();
    expect(decodeServerMessage(" ".repeat(MAX_MESSAGE_BYTES + 1))).toBeNull();
  });

  it.each([
    { hp: -1 },
    { hp: 11 },
    { maxHp: 0 },
    { position: { x: Infinity, y: 0 } },
    { team: "neutral" },
    { ownerId: "" },
  ])("rejects invalid entity %j", (fields) => {
    expect(entitySchema.safeParse({ ...makeEntity(), ...fields }).success).toBe(
      false,
    );
  });

  it.each([
    { tick: -1 },
    { tick: 0.5 },
    { tick: Number.MAX_SAFE_INTEGER + 1 },
    { phase: 4 },
    { resources: { gold: -1, wood: 0, rage: 0 } },
    { timeLeftSeconds: -1 },
    { entities: [makeSnapshot().entities[0], makeSnapshot().entities[0]] },
    {
      entities: Array.from({ length: MAX_SNAPSHOT_ENTITIES + 1 }, (_, id) => ({
        ...makeSnapshot().entities[0],
        id: String(id),
      })),
    },
  ])("rejects invalid snapshot %j", (fields) => {
    expect(
      snapshotSchema.safeParse({ ...makeSnapshot(), ...fields }).success,
    ).toBe(false);
  });

  it("rejects malformed or unexpected server messages", () => {
    expect(decodeServerMessage("{")).toBeNull();
    expect(
      decodeServerMessage(
        JSON.stringify({ v: 5, t: "pong", requestId: "r", extra: 1 }),
      ),
    ).toBeNull();
    expect(
      decodeServerMessage(
        JSON.stringify({ v: 5, t: "error", code: "INVENTED" }),
      ),
    ).toBeNull();
  });
});

it("rejects steering outside the direction range", () => {
  expect(intentSchema.safeParse({ t: "steer", x: 2, y: 0 }).success).toBe(
    false,
  );
});

it("validates building states and rejects malformed or duplicate structures", () => {
  const building = {
    ...makeEntity(),
    id: "wall-1",
    buildingId: "wall",
    radius: 24,
    level: 1,
  };
  expect(
    snapshotSchema.safeParse({ ...makeSnapshot(), buildings: [building] })
      .success,
  ).toBe(true);
  for (const changes of [
    { level: 3 },
    { radius: -1 },
    { hp: 11 },
    { ownerId: null },
  ]) {
    expect(
      snapshotSchema.safeParse({
        ...makeSnapshot(),
        buildings: [{ ...building, ...changes }],
      }).success,
    ).toBe(false);
  }
  expect(
    snapshotSchema.safeParse({
      ...makeSnapshot(),
      buildings: [building, building],
    }).success,
  ).toBe(false);
});
