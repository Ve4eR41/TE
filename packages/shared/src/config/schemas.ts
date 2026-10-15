import { z } from "zod";
import { MAX_SNAPSHOT_ENTITIES } from "../constants.js";

const idSchema = (() =>
  z
    .string()
    .min(1)
    .refine((value) => value.trim() === value, {
      message: "ID must not contain leading or trailing whitespace",
    }))();

const nameSchema = (() =>
  z.string().refine((value) => value.trim().length > 0, {
    message: "Name must not be blank",
  }))();

export const costSchema = (() =>
  z.strictObject({
    gold: z.number().int().nonnegative(),
    wood: z.number().int().nonnegative(),
  }))();

export const resourcesSchema = (() =>
  z.strictObject({
    gold: z.number().finite().nonnegative(),
    wood: z.number().finite().nonnegative(),
    rage: z.number().finite().nonnegative(),
  }))();
const teamResourcesSchema = (() =>
  z.strictObject({ troll: resourcesSchema, elves: resourcesSchema }))();
export const economySchema = (() =>
  z.strictObject({
    starting: teamResourcesSchema,
    incomePerSecond: teamResourcesSchema,
  }))();

export const matchSchema = (() =>
  z
    .strictObject({
      durationSeconds: z.number().int().positive(),
      tickRateHz: z.number().int().positive(),
      phaseStartSeconds: z.tuple([
        z.number().int().nonnegative(),
        z.number().int().nonnegative(),
        z.number().int().nonnegative(),
      ]),
    })
    .superRefine((match, context) => {
      match.phaseStartSeconds.forEach((start, index, phases) => {
        if (index === 0 && start !== 0) {
          context.addIssue({
            code: "custom",
            path: ["phaseStartSeconds", index],
            message: "The first phase must start at zero",
          });
        }
        const previous = phases[index - 1];
        if (previous !== undefined && start <= previous) {
          context.addIssue({
            code: "custom",
            path: ["phaseStartSeconds", index],
            message: "Phase starts must be strictly increasing",
          });
        }
        if (start >= match.durationSeconds) {
          context.addIssue({
            code: "custom",
            path: ["phaseStartSeconds", index],
            message: "Phase must start before the match ends",
          });
        }
      });
    }))();

export const unitSchema = (() =>
  z.strictObject({
    id: idSchema,
    name: nameSchema,
    hp: z.number().int().positive(),
    speedUnitsPerSecond: z.number().finite().nonnegative(),
    attackDamage: z.number().finite().nonnegative(),
    cost: costSchema,
  }))();

export const buildingSchema = (() =>
  z
    .strictObject({
      id: idSchema,
      name: nameSchema,
      hp: z.number().int().positive(),
      cost: costSchema,
      radius: z.number().finite().positive(),
      buildRangeUnits: z.number().finite().positive(),
      maxPerPlayer: z.number().int().positive().max(MAX_SNAPSHOT_ENTITIES),
      upgrade: z
        .strictObject({ hp: z.number().int().positive(), cost: costSchema })
        .optional(),
    })
    .refine(
      (building) => !building.upgrade || building.upgrade.hp > building.hp,
      { path: ["upgrade", "hp"], message: "Upgrade HP must exceed base HP" },
    ))();

export const itemSchema = (() =>
  z.strictObject({ id: idSchema, name: nameSchema, cost: costSchema }))();

export const classSchema = (() =>
  z.strictObject({ id: idSchema, name: nameSchema }))();

export const abilitySchema = (() =>
  z.strictObject({
    id: idSchema,
    name: nameSchema,
    cooldownSeconds: z.number().finite().nonnegative(),
  }))();

const uniqueById = <Entry extends { id: string }>(schema: z.ZodType<Entry>) =>
  z.array(schema).superRefine((entries, context) => {
    const ids = new Set<string>();
    entries.forEach((entry, index) => {
      if (ids.has(entry.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Duplicate ID",
        });
      }
      ids.add(entry.id);
    });
  });

export const unitsSchema = (() => uniqueById(unitSchema))();
export const buildingsSchema = (() => uniqueById(buildingSchema))();
export const itemsSchema = (() => uniqueById(itemSchema))();
export const classesSchema = (() => uniqueById(classSchema))();
export const abilitiesSchema = (() => uniqueById(abilitySchema))();

export const gameConfigSchema = (() =>
  z.strictObject({
    match: matchSchema,
    economy: economySchema,
    units: unitsSchema,
    buildings: buildingsSchema,
    items: itemsSchema,
    classes: classesSchema,
    abilities: abilitiesSchema,
  }))();
