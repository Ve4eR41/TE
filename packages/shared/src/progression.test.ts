import { expect, it } from "vitest";
import { buildingSchema, unitSchema, playerEntitySchema } from "./index.js";

const troll = (() => ({
  id: "troll",
  name: "Troll",
  hp: 100,
  speedUnitsPerSecond: 145,
  attackDamage: 0,
  cost: { gold: 0, wood: 0 },
  progression: [
    { hp: 150, speedUnitsPerSecond: 155, cost: { gold: 0, wood: 0, rage: 30 } },
    { hp: 225, speedUnitsPerSecond: 165, cost: { gold: 0, wood: 0, rage: 60 } },
  ],
}))();
it("validates progression prices, role, ordering and finite stats", () => {
  expect(unitSchema.parse(troll)).toEqual(troll);
  for (const change of [
    { id: "elves" },
    { progression: [] },
    { progression: [{ ...troll.progression[0], hp: 99 }] },
    { progression: [{ ...troll.progression[0], speedUnitsPerSecond: 144 }] },
    {
      progression: [
        { ...troll.progression[0], cost: { gold: 0, wood: 0, rage: -1 } },
      ],
    },
    { progression: [...troll.progression, { ...troll.progression[0] }] },
    { progression: [{ ...troll.progression[0], hp: Infinity }] },
  ])
    expect(unitSchema.safeParse({ ...troll, ...change }).success).toBe(false);
});
it("validates public avatar progression without allowing injected client stats", () => {
  const entity = {
    id: "troll-1",
    ownerId: "troll-1",
    team: "troll",
    hp: 150,
    maxHp: 150,
    level: 2,
    speedUnitsPerSecond: 155,
    position: { x: 160, y: 445 },
  };
  expect(playerEntitySchema.parse(entity)).toEqual(entity);
  for (const change of [
    { level: 0 },
    { level: 1.5 },
    { speedUnitsPerSecond: -1 },
    { hp: 151 },
    { ownerId: null },
  ])
    expect(playerEntitySchema.safeParse({ ...entity, ...change }).success).toBe(
      false,
    );
});
it("validates optional building income including upgraded income", () => {
  const hall = {
    id: "town-hall",
    name: "hall",
    hp: 500,
    radius: 34,
    maxPerPlayer: 1,
    buildRangeUnits: 160,
    cost: { gold: 60, wood: 60 },
    incomePerSecond: { gold: 2, wood: 1, rage: 0 },
    upgrade: {
      hp: 800,
      cost: { gold: 80, wood: 80 },
      incomePerSecond: { gold: 4, wood: 2, rage: 0 },
    },
  };
  expect(buildingSchema.parse(hall)).toEqual(hall);
  expect(
    buildingSchema.safeParse({
      ...hall,
      incomePerSecond: { gold: -1, wood: 0, rage: 0 },
    }).success,
  ).toBe(false);
  expect(
    buildingSchema.safeParse({
      ...hall,
      upgrade: {
        ...hall.upgrade,
        incomePerSecond: { gold: Infinity, wood: 0, rage: 0 },
      },
    }).success,
  ).toBe(false);
});
