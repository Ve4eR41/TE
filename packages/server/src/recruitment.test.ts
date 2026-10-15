import { describe, expect, it } from "vitest";
import type { UnitConfig } from "@troll-vs-elves/shared";
import { MatchRoom } from "./match-room.js";

const guard = (() => ({
  id: "guard",
  name: "Guard",
  hp: 80,
  speedUnitsPerSecond: 110,
  attackDamage: 0,
  cost: { gold: 40, wood: 20 },
  recruitment: {
    radius: 12,
    maxPerPlayer: 3,
    aggroRangeUnits: 240,
    stopRangeUnits: 36,
    spawnOffsets: [
      { x: 48, y: 0 },
      { x: -48, y: 0 },
      { x: 0, y: 48 },
    ],
  },
}))();
const create = (definition: UnitConfig = guard, trollX = 340) => {
  const room = new MatchRoom(
    {
      durationSeconds: 1800,
      tickRateHz: 20,
      phaseStartSeconds: [0, 600, 1200],
    },
    {
      id: "forest",
      width: 960,
      height: 700,
      bounds: { left: 100, right: 870, top: 140, bottom: 640 },
      avatarRadius: 14,
      spawns: [
        { x: 160, y: 445 },
        { x: trollX, y: 445 },
      ],
      trees: [],
      obstacles: [],
      pond: { x: 765, y: 530, radiusX: 119, radiusY: 76 },
    },
    [
      ...["elves", "troll"].map((id) => ({
        id,
        name: id,
        hp: 100,
        speedUnitsPerSecond: 100,
        attackDamage: 0,
        cost: { gold: 0, wood: 0 },
      })),
      definition,
    ],
    {
      starting: {
        elves: { gold: 120, wood: 120, rage: 0 },
        troll: { gold: 0, wood: 0, rage: 0 },
      },
      incomePerSecond: {
        elves: { gold: 0, wood: 0, rage: 0 },
        troll: { gold: 0, wood: 0, rage: 0 },
      },
    },
    [
      {
        id: "wall",
        name: "wall",
        hp: 200,
        radius: 24,
        buildRangeUnits: 160,
        maxPerPlayer: 6,
        cost: { gold: 0, wood: 0 },
      },
    ],
  );
  const elf = room.join("elves");
  return { room, elf };
};
const hire = (room: MatchRoom, player: string, unitId = "guard") =>
  room.intent(player, { t: "hire", unitId });

describe("hired guards", () => {
  it("charges once per accepted hire, publishes ownership and preserves player count", () => {
    const { room, elf } = create();
    expect(hire(room, elf)).toBeNull();
    expect(room.snapshot(elf).resources).toEqual({
      gold: 80,
      wood: 100,
      rage: 0,
    });
    expect(room.snapshot().entities).toHaveLength(1);
    expect(room.snapshot().units[0]).toMatchObject({
      ownerId: elf,
      unitId: "guard",
      hp: 80,
      radius: 12,
      position: { x: 208, y: 445 },
    });
    expect(room.welcome(elf)).toMatchObject({ unitDefinitions: [guard] });
    expect(hire(room, elf)).toBeNull();
    expect(hire(room, elf)).toBeNull();
    expect(hire(room, elf)).toBe("UNIT_LIMIT_REACHED");
    expect(room.snapshot(elf).resources.gold).toBe(0);
  });
  it("rejects roles, avatar IDs, unknown definitions and insufficient resources without spending", () => {
    const { room, elf } = create({ ...guard, cost: { gold: 121, wood: 0 } });
    const troll = room.join("troll");
    expect(hire(room, troll)).toBe("ACTION_FORBIDDEN");
    expect(hire(room, elf, "elves")).toBe("INVALID_UNIT");
    expect(hire(room, elf, "missing")).toBe("INVALID_UNIT");
    expect(hire(room, elf)).toBe("INSUFFICIENT_RESOURCES");
    expect(room.snapshot(elf).resources.gold).toBe(120);
    expect(room.snapshot().units).toEqual([]);
  });
  it("rejects occupied/reserved spawn points without spending, including previous recruits", () => {
    const { room, elf } = create({
      ...guard,
      recruitment: { ...guard.recruitment, spawnOffsets: [{ x: 48, y: 0 }] },
    });
    expect(hire(room, elf)).toBeNull();
    expect(hire(room, elf)).toBe("SPAWN_BLOCKED");
    expect(room.snapshot(elf).resources.gold).toBe(80);
    const reserved = create({
      ...guard,
      recruitment: { ...guard.recruitment, spawnOffsets: [{ x: 180, y: 0 }] },
    });
    expect(hire(reserved.room, reserved.elf)).toBe("SPAWN_BLOCKED");
    expect(reserved.room.snapshot(reserved.elf).resources.gold).toBe(120);
  });
  it("blocks spawning through a wall and forbids building on a guard", () => {
    const { room, elf } = create({
      ...guard,
      recruitment: { ...guard.recruitment, spawnOffsets: [{ x: 100, y: 0 }] },
    });
    expect(
      room.intent(elf, { t: "build", buildingId: "wall", x: 210, y: 445 }),
    ).toBeNull();
    expect(hire(room, elf)).toBe("SPAWN_BLOCKED");
    expect(room.snapshot(elf).resources.gold).toBe(120);
    const open = create();
    hire(open.room, open.elf);
    expect(
      open.room.intent(open.elf, {
        t: "build",
        buildingId: "wall",
        x: 230,
        y: 445,
      }),
    ).toBe("INVALID_TARGET");
  });
  it("waits without a troll, pursues at configured speed and stops without damage", () => {
    const { room, elf } = create();
    hire(room, elf);
    room.advance(1);
    expect(room.snapshot().units[0]?.position.x).toBe(208);
    room.join("troll");
    room.advance(0.05);
    expect(room.snapshot().units[0]?.position.x).toBeCloseTo(213.5);
    room.advance(20); // capped catch-up
    expect(room.snapshot().units[0]?.position.x).toBeCloseTo(224.5);
    for (let i = 0; i < 100; i++) room.advance(0.05);
    expect(room.snapshot().units[0]?.position.x).toBeCloseTo(304);
    expect(room.snapshot().entities.map(({ hp }) => hp)).toEqual([100, 100]);
  });
  it("stays outside aggro radius and stops when the troll leaves", () => {
    const far = create(guard, 700);
    hire(far.room, far.elf);
    far.room.join("troll");
    far.room.advance(0.1);
    expect(far.room.snapshot().units[0]?.position.x).toBe(208);
    const { room, elf } = create();
    hire(room, elf);
    const troll = room.join("troll");
    room.advance(0.05);
    room.leave(troll);
    const position = room.snapshot().units[0]?.position;
    room.advance(0.1);
    expect(room.snapshot().units[0]?.position).toEqual(position);
  });
  it("cannot cross walls and freezes at match end; departure removes owned units", () => {
    const { room, elf } = create();
    hire(room, elf);
    room.intent(elf, { t: "build", buildingId: "wall", x: 260, y: 445 });
    room.join("troll");
    for (let i = 0; i < 20; i++) room.advance(0.05);
    expect(room.snapshot().units[0]?.position.x).toBeLessThan(224);
    room.advance(1800);
    const position = room.snapshot().units[0]?.position;
    expect(hire(room, elf)).toBe("MATCH_ENDED");
    room.advance(1);
    expect(room.snapshot().units[0]?.position).toEqual(position);
    room.leave(elf);
    expect(room.snapshot().units).toEqual([]);
  });
});
