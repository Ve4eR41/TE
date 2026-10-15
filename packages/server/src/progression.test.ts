import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig, loadMap } from "@troll-vs-elves/shared/config/node";
import { MatchRoom } from "./match-room.js";

const create = () => {
  const path = fileURLToPath(new URL("../../../config/", import.meta.url));
  const config = loadConfig(path);
  const room = new MatchRoom(
    config.match,
    loadMap(path),
    config.units,
    config.economy,
    config.buildings,
  );
  return { room, config };
};
const build = (room: MatchRoom, player: string, x = 250, y = 445) =>
  room.intent(player, { t: "build", buildingId: "town-hall", x, y });
const upgrade = (room: MatchRoom, player: string, id = player) =>
  room.intent(player, { t: "upgrade", entityId: id });

describe("town hall", () => {
  it("charges construction, limits one per owner, blocks movement and grants private income", () => {
    const { room } = create();
    const elf = room.join("elves");
    const other = room.join("elves");
    room.advance(1);
    expect(room.snapshot(elf).resources).toEqual({
      gold: 122,
      wood: 123,
      rage: 0,
    });
    expect(build(room, elf)).toBeNull();
    const hall = room.snapshot().buildings[0];
    expect(hall).toMatchObject({
      buildingId: "town-hall",
      ownerId: elf,
      hp: 500,
      radius: 34,
      level: 1,
    });
    expect(room.snapshot(elf).resources).toEqual({
      gold: 62,
      wood: 63,
      rage: 0,
    });
    expect(build(room, elf, 250, 530)).toBe("BUILD_LIMIT_REACHED");
    room.advance(0.5);
    expect(room.snapshot(elf).resources).toEqual({
      gold: 64,
      wood: 65,
      rage: 0,
    });
    expect(room.snapshot(other).resources).toEqual({
      gold: 123,
      wood: 124.5,
      rage: 0,
    });
    room.intent(elf, { t: "move", x: 300, y: 445 });
    for (let i = 0; i < 30; i++) room.advance(0.05);
    expect(
      room.snapshot().entities.find(({ id }) => id === elf)?.position.x,
    ).toBeLessThanOrEqual(202);
    room.leave(elf);
    expect(room.snapshot().buildings).toEqual([]);
    room.advance(1);
    expect(room.snapshot(other).resources.gold).toBeCloseTo(128);
  });
  it("checks placement, costs, role and ownership before mutation", () => {
    const { room } = create();
    const elf = room.join("elves");
    const troll = room.join("troll");
    expect(build(room, troll)).toBe("ACTION_FORBIDDEN");
    expect(build(room, elf, 160, 445)).toBe("INVALID_TARGET");
    expect(room.snapshot(elf).resources.gold).toBe(120);
    expect(build(room, elf)).toBeNull();
    const id = room.snapshot().buildings[0]?.id ?? "missing";
    expect(upgrade(room, elf, id)).toBe("INSUFFICIENT_RESOURCES");
    const other = room.join("elves");
    expect(upgrade(room, other, id)).toBe("NOT_OWNER");
    expect(room.snapshot().buildings[0]?.level).toBe(1);
  });
  it("replaces bonus after upgrade, charges once and caps income at match end", () => {
    const { room } = create();
    const elf = room.join("elves");
    build(room, elf);
    const id = room.snapshot().buildings[0]?.id ?? "missing";
    room.advance(5); //80/80; bonus for precisely these five seconds
    expect(room.snapshot(elf).resources).toEqual({
      gold: 80,
      wood: 80,
      rage: 0,
    });
    expect(upgrade(room, elf, id)).toBeNull();
    expect(room.snapshot(elf).resources).toEqual({ gold: 0, wood: 0, rage: 0 });
    expect(room.snapshot().buildings[0]).toMatchObject({
      hp: 800,
      maxHp: 800,
      level: 2,
    });
    expect(upgrade(room, elf, id)).toBe("MAX_LEVEL");
    room.advance(0.5);
    expect(room.snapshot(elf).resources).toEqual({
      gold: 3,
      wood: 2.5,
      rage: 0,
    });
    room.advance(9999);
    expect(room.snapshot(elf).resources).toEqual({
      gold: 10770,
      wood: 8975,
      rage: 0,
    });
    room.advance(1);
    expect(room.snapshot(elf).resources.gold).toBe(10770);
    expect(upgrade(room, elf, id)).toBe("MATCH_ENDED");
  });
});

describe("troll progression", () => {
  it("spends private rage, increases HP and actually uses upgraded movement speed", () => {
    const { room } = create();
    const troll = room.join("troll");
    expect(upgrade(room, troll)).toBeNull();
    expect(room.snapshot(troll).resources.rage).toBe(30);
    expect(room.snapshot().entities[0]).toMatchObject({
      level: 2,
      hp: 150,
      maxHp: 150,
      speedUnitsPerSecond: 155,
    });
    room.intent(troll, { t: "move", x: 260, y: 445 });
    room.advance(0.05);
    expect(room.snapshot().entities[0]?.position.x).toBeCloseTo(167.75);
    expect(room.snapshot(troll).resources.rage).toBeCloseTo(30.15);
    expect(upgrade(room, troll)).toBe("INSUFFICIENT_RESOURCES");
    expect(room.snapshot().entities[0]?.level).toBe(2);
  });
  it("checks ownership, caps levels, freezes at timer end and resets on rejoin", () => {
    const { room } = create();
    const troll = room.join("troll");
    const elf = room.join("elves");
    expect(upgrade(room, elf, troll)).toBe("NOT_OWNER");
    expect(upgrade(room, troll, elf)).toBe("NOT_OWNER");
    expect(upgrade(room, elf)).toBe("ACTION_FORBIDDEN");
    room.advance(40);
    for (let i = 0; i < 3; i++) expect(upgrade(room, troll)).toBeNull();
    expect(room.snapshot(troll).resources.rage).toBe(0);
    expect(room.snapshot().entities[0]).toMatchObject({
      level: 4,
      hp: 325,
      speedUnitsPerSecond: 175,
    });
    expect(upgrade(room, troll)).toBe("MAX_LEVEL");
    room.advance(1800);
    const wallet = room.snapshot(troll).resources;
    room.advance(5);
    expect(room.snapshot(troll).resources).toEqual(wallet);
    expect(upgrade(room, troll)).toBe("MATCH_ENDED");
    room.leave(troll);
    const fresh = room.join("troll");
    expect(
      room.snapshot().entities.find(({ id }) => id === fresh),
    ).toMatchObject({ level: 1, hp: 100, speedUnitsPerSecond: 145 });
    expect(room.snapshot(fresh).resources.rage).toBe(60);
  });
});
