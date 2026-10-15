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
import { MatchRoom } from "./match-room.js";

const match = (() => ({
  durationSeconds: 1800,
  tickRateHz: 20,
  phaseStartSeconds: [0, 600, 1200] as [number, number, number],
}))();
const units = (() =>
  ["troll", "elves"].map((id) => ({
    id,
    name: id,
    hp: 100,
    speedUnitsPerSecond: 100,
    attackDamage: 0,
    cost: { gold: 0, wood: 0 },
  })))();
const economy = (() => ({
  starting: {
    troll: { gold: 0, wood: 0, rage: 0 },
    elves: { gold: 120, wood: 120, rage: 0 },
  },
  incomePerSecond: {
    troll: { gold: 0, wood: 0, rage: 0 },
    elves: { gold: 2, wood: 3, rage: 0 },
  },
}))();
describe("match clock", () => {
  it("starts on join, switches at phase boundaries and stops at zero", () => {
    const room = new MatchRoom(match, makeMap(), units, economy);
    room.advance(600);
    expect(room.snapshot().tick).toBe(0);
    room.join();
    room.advance(599);
    expect(room.snapshot().phase).toBe(1);
    room.advance(1);
    expect(room.snapshot()).toMatchObject({ phase: 2, timeLeftSeconds: 1200 });
    room.advance(600);
    expect(room.snapshot().phase).toBe(3);
    room.advance(900);
    expect(room.snapshot().timeLeftSeconds).toBe(0);
    room.advance(1);
    expect(room.snapshot().timeLeftSeconds).toBe(0);
  });
  it("resets when empty and ignores invalid deltas", () => {
    const room = new MatchRoom(match, makeMap(), units, economy);
    const player = room.join();
    room.advance(30);
    room.advance(NaN);
    room.advance(-10);
    expect(room.snapshot().timeLeftSeconds).toBe(1770);
    room.leave(player);
    expect(room.snapshot()).toMatchObject({
      tick: 0,
      phase: 1,
      timeLeftSeconds: 1800,
    });
  });
});

describe("authoritative avatars", () => {
  it("moves only the sender at configured speed without teleporting", () => {
    const room = new MatchRoom(match, makeMap(), units, economy);
    const troll = room.join();
    room.join();
    const before = room.snapshot().entities;
    expect(before.map(({ team }) => team)).toEqual(["troll", "elves"]);
    expect(room.intent(troll, { t: "move", x: 260, y: 445 })).toBeNull();
    room.advance(0.05);
    const after = room.snapshot().entities;
    expect(after[0]?.position.x).toBe(165);
    expect(after[1]?.position).toEqual(before[1]?.position);
    room.advance(30);
    expect(room.snapshot().entities[0]?.position.x).toBe(175);
    expect(room.intent("intruder", { t: "move", x: 200, y: 445 })).toBe(
      "INVALID_TARGET",
    );
  });
  it("normalizes diagonal input and expires stale steering", () => {
    const room = new MatchRoom(match, makeMap(), units, economy);
    const player = room.join();
    room.intent(player, { t: "steer", x: 1, y: 1 });
    room.advance(0.05);
    const position = room.snapshot().entities[0]?.position;
    expect(
      Math.hypot((position?.x ?? 0) - 160, (position?.y ?? 0) - 445),
    ).toBeCloseTo(5);
    room.advance(1);
    expect(room.snapshot().entities[0]?.position).toEqual(position);
    room.intent(player, { t: "steer", x: 0, y: 0 });
    room.advance(0.05);
    expect(room.snapshot().entities[0]?.position).toEqual(position);
  });
  it("rejects blocked targets and stops before crossing obstacles", () => {
    const map = makeMap();
    map.obstacles = [{ x: 190, y: 445, radiusX: 2, radiusY: 2 }];
    const room = new MatchRoom(match, map, units, economy);
    const player = room.join();
    expect(room.intent(player, { t: "move", x: 190, y: 445 })).toBe(
      "INVALID_TARGET",
    );
    expect(room.intent(player, { t: "move", x: 0, y: 0 })).toBe(
      "INVALID_TARGET",
    );
    room.intent(player, { t: "move", x: 260, y: 445 });
    for (let i = 0; i < 20; i += 1) room.advance(0.05);
    expect(room.snapshot().entities[0]?.position.x).toBeLessThan(174);
  });
  it("limits capacity, removes avatars and reuses a free spawn", () => {
    const room = new MatchRoom(match, makeMap(), units, economy);
    const first = room.join();
    const second = room.join();
    expect(() => room.join()).toThrow("Room full");
    room.leave(first);
    room.join();
    expect(room.snapshot().entities.map(({ team }) => team)).toEqual([
      "elves",
      "troll",
    ]);
    expect(room.snapshot().entities[0]?.ownerId).toBe(second);
    expect(
      new Set(room.snapshot().entities.map(({ position }) => position.x)).size,
    ).toBe(2);
  });
  it("freezes movement at the end of the timer", () => {
    const room = new MatchRoom(match, makeMap(), units, economy);
    const player = room.join();
    room.advance(1800);
    const before = room.snapshot().entities[0]?.position;
    room.intent(player, { t: "move", x: 260, y: 445 });
    room.advance(1);
    expect(room.snapshot().entities[0]?.position).toEqual(before);
  });
});

describe("private economy", () => {
  it("accrues fractional income for each owner and stops at the match end", () => {
    const room = new MatchRoom(match, makeMap(), units, economy);
    const troll = room.join("troll");
    const elf = room.join("elves");
    room.advance(0.25);
    expect(room.snapshot(elf).resources).toEqual({
      gold: 120.5,
      wood: 120.75,
      rage: 0,
    });
    expect(room.snapshot(troll).resources).toEqual({
      gold: 0,
      wood: 0,
      rage: 0,
    });
    expect(room.snapshot("unknown").resources).toEqual({
      gold: 0,
      wood: 0,
      rage: 0,
    });
    room.advance(2000);
    expect(room.snapshot(elf).resources.gold).toBe(3720);
    room.advance(1);
    expect(room.snapshot(elf).resources.gold).toBe(3720);
  });
  it("removes old wallets, resets on rejoin and does not expose mutable resources", () => {
    const room = new MatchRoom(match, makeMap(), units, economy);
    const first = room.join("elves");
    room.advance(10);
    const snapshot = room.snapshot(first);
    snapshot.resources.gold = 0;
    expect(room.snapshot(first).resources.gold).toBe(140);
    room.leave(first);
    const second = room.join("elves");
    expect(room.snapshot(second).resources.gold).toBe(120);
    expect(room.snapshot(first).resources.gold).toBe(0);
  });
});

const wall = (() => ({
  id: "wall",
  name: "Лесная стена",
  hp: 200,
  radius: 24,
  buildRangeUnits: 160,
  maxPerPlayer: 6,
  cost: { gold: 30, wood: 40 },
  upgrade: { hp: 400, cost: { gold: 40, wood: 30 } },
}))();

const createBuilder = (definition = wall) => {
  const room = new MatchRoom(match, makeMap(), units, economy, [definition]);
  const player = room.join("elves");
  return { room, player };
};
const placeWall = (room: MatchRoom, player: string, x = 220, y = 445) =>
  room.intent(player, { t: "build", buildingId: "wall", x, y });
describe("construction", () => {
  it("spends exact costs, publishes a wall and blocks movement through it", () => {
    const { room, player } = createBuilder();
    expect(placeWall(room, player)).toBeNull();
    expect(room.snapshot(player).resources).toEqual({
      gold: 90,
      wood: 80,
      rage: 0,
    });
    expect(room.snapshot(player).buildings[0]).toMatchObject({
      ownerId: player,
      hp: 200,
      level: 1,
      position: { x: 220, y: 445 },
    });
    room.intent(player, { t: "move", x: 300, y: 445 });
    for (let i = 0; i < 40; i += 1) room.advance(0.05);
    expect(room.snapshot().entities[0]?.position.x).toBeLessThanOrEqual(182);
  });
  it("rejects overlap, spawns, avatars, map obstacles and out-of-range sites without spending", () => {
    const { room, player } = createBuilder({ ...wall, buildRangeUnits: 1000 });
    const before = room.snapshot(player).resources;
    for (const [x, y] of [
      [160, 445],
      [570, 385],
      [455, 305],
      [100, 445],
    ]) {
      expect(placeWall(room, player, x, y)).toBe("INVALID_TARGET");
      expect(room.snapshot(player).resources).toEqual(before);
    }
    expect(
      room.intent(player, {
        t: "build",
        buildingId: "unknown",
        x: 220,
        y: 445,
      }),
    ).toBe("INVALID_BUILDING");
    expect(placeWall(room, player)).toBeNull();
    expect(placeWall(room, player, 230, 445)).toBe("INVALID_TARGET");
    expect(room.snapshot(player).resources.gold).toBe(90);
    const narrow = createBuilder();
    expect(placeWall(narrow.room, narrow.player, 700, 400)).toBe(
      "OUT_OF_RANGE",
    );
  });
  it("checks team, insufficient resources, per-player limit and match expiration", () => {
    const { room, player } = createBuilder({ ...wall, maxPerPlayer: 1 });
    const troll = room.join("troll");
    expect(placeWall(room, troll)).toBe("ACTION_FORBIDDEN");
    expect(placeWall(room, player)).toBeNull();
    expect(placeWall(room, player, 290, 445)).toBe("BUILD_LIMIT_REACHED");
    const poor = createBuilder({ ...wall, cost: { gold: 121, wood: 0 } });
    expect(placeWall(poor.room, poor.player)).toBe("INSUFFICIENT_RESOURCES");
    expect(poor.room.snapshot(poor.player).resources.gold).toBe(120);
    room.advance(1800);
    expect(placeWall(room, player)).toBe("MATCH_ENDED");
  });
  it("upgrades only the owner's wall once and charges once", () => {
    const { room, player } = createBuilder();
    placeWall(room, player);
    const building = room.snapshot().buildings[0];
    if (!building) throw new Error("No wall");
    const other = room.join("elves");
    expect(room.intent(other, { t: "upgrade", entityId: building.id })).toBe(
      "NOT_OWNER",
    );
    expect(
      room.intent(player, { t: "upgrade", entityId: building.id }),
    ).toBeNull();
    expect(room.snapshot().buildings[0]).toMatchObject({
      hp: 400,
      maxHp: 400,
      level: 2,
    });
    expect(room.snapshot(player).resources).toEqual({
      gold: 50,
      wood: 50,
      rage: 0,
    });
    expect(room.intent(player, { t: "upgrade", entityId: building.id })).toBe(
      "MAX_LEVEL",
    );
    expect(room.snapshot(player).resources.gold).toBe(50);
  });
  it("rejects an upgrade when out of range or unaffordable", () => {
    const { room, player } = createBuilder({
      ...wall,
      upgrade: { hp: 400, cost: { gold: 121, wood: 0 } },
    });
    placeWall(room, player);
    const building = room.snapshot().buildings[0];
    if (!building) throw new Error("No wall");
    expect(room.intent(player, { t: "upgrade", entityId: building.id })).toBe(
      "INSUFFICIENT_RESOURCES",
    );
    expect(room.snapshot().buildings[0]?.level).toBe(1);
    room.intent(player, { t: "move", x: 160, y: 620 });
    for (let i = 0; i < 40; i += 1) room.advance(0.05);
    expect(room.intent(player, { t: "upgrade", entityId: building.id })).toBe(
      "OUT_OF_RANGE",
    );
  });
  it("removes the departing player's structures and frees movement", () => {
    const { room, player } = createBuilder();
    placeWall(room, player);
    room.leave(player);
    expect(room.snapshot().buildings).toEqual([]);
    expect(room.snapshot().timeLeftSeconds).toBe(1800);
    const next = room.join("elves");
    expect(placeWall(room, next)).toBeNull();
  });
});
