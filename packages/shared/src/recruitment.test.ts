import { expect, it } from "vitest";
import { unitSchema, unitEntitySchema, snapshotSchema } from "./index.js";

const definition = (() => ({
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
    spawnOffsets: [{ x: 48, y: 0 }],
  },
}))();
it("accepts optional recruitment and validates all new config boundaries", () => {
  expect(unitSchema.parse(definition)).toEqual(definition);
  for (const change of [
    { radius: 0 },
    { maxPerPlayer: 129 },
    { maxPerPlayer: 0.5 },
    { aggroRangeUnits: Infinity },
    { stopRangeUnits: 240 },
    { stopRangeUnits: 0 },
    { spawnOffsets: [] },
    { spawnOffsets: [{ x: NaN, y: 0 }] },
    { unexpected: true },
  ])
    expect(
      unitSchema.safeParse({
        ...definition,
        recruitment: { ...definition.recruitment, ...change },
      }).success,
    ).toBe(false);
});
const unit = (() => ({
  id: "guard-1",
  ownerId: "elf-1",
  unitId: "guard",
  team: "elves",
  hp: 80,
  maxHp: 80,
  radius: 12,
  position: { x: 208, y: 445 },
}))();
it("validates guard state and rejects duplicate and oversized public unit lists", () => {
  expect(unitEntitySchema.parse(unit)).toEqual(unit);
  for (const change of [
    { ownerId: null },
    { radius: 0 },
    { hp: 81 },
    { unitId: "" },
  ])
    expect(unitEntitySchema.safeParse({ ...unit, ...change }).success).toBe(
      false,
    );
  const snapshot = {
    tick: 0,
    entities: [],
    buildings: [],
    units: [unit],
    resources: { gold: 0, wood: 0, rage: 0 },
    phase: 1,
    timeLeftSeconds: 1800,
  };
  expect(snapshotSchema.safeParse(snapshot).success).toBe(true);
  expect(
    snapshotSchema.safeParse({ ...snapshot, units: [unit, unit] }).success,
  ).toBe(false);
  expect(
    snapshotSchema.safeParse({
      ...snapshot,
      units: Array.from({ length: 129 }, (_, i) => ({
        ...unit,
        id: `guard-${i}`,
      })),
    }).success,
  ).toBe(false);
});
