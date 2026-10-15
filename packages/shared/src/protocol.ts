import { z } from "zod";
import { forestMapSchema } from "./map.js";
import { matchSchema, buildingsSchema, unitsSchema } from "./config/schemas.js";
import {
  MAX_IDENTIFIER_LENGTH,
  MAX_MESSAGE_BYTES,
  MAX_SNAPSHOT_ENTITIES,
  PROTOCOL_VERSION,
} from "./constants.js";

const idSchema = (() =>
  z
    .string()
    .min(1)
    .max(MAX_IDENTIFIER_LENGTH)
    .refine((value) => value.trim() === value, "Identifier must be trimmed"))();
const coordinates = (() => ({
  x: z.number().finite(),
  y: z.number().finite(),
}))();

export const intentSchema = (() =>
  z.discriminatedUnion("t", [
    z.strictObject({ t: z.literal("move"), ...coordinates }),
    z.strictObject({
      t: z.literal("steer"),
      x: z.number().finite().min(-1).max(1),
      y: z.number().finite().min(-1).max(1),
    }),
    z.strictObject({
      t: z.literal("build"),
      buildingId: idSchema,
      ...coordinates,
    }),
    z.strictObject({ t: z.literal("hire"), unitId: idSchema }),
    z.strictObject({ t: z.literal("upgrade"), entityId: idSchema }),
    z.strictObject({
      t: z.literal("ability"),
      abilityId: idSchema,
      target: idSchema.optional(),
    }),
    z.strictObject({ t: z.literal("buy"), itemId: idSchema }),
    z.strictObject({ t: z.literal("subclass"), id: idSchema }),
  ]))();

export const entitySchema = (() =>
  z
    .strictObject({
      id: idSchema,
      ownerId: idSchema.nullable(),
      team: z.enum(["troll", "elves"]),
      position: z.strictObject(coordinates),
      hp: z.number().finite().nonnegative(),
      maxHp: z.number().finite().positive(),
    })
    .refine((entity) => entity.hp <= entity.maxHp, {
      path: ["hp"],
      message: "HP exceeds maxHp",
    }))();

export const playerEntitySchema = (() =>
  entitySchema.safeExtend({
    ownerId: idSchema,
    level: z.number().int().positive(),
    speedUnitsPerSecond: z.number().finite().nonnegative(),
  }))();

export const buildingEntitySchema = (() =>
  entitySchema.safeExtend({
    ownerId: idSchema,
    buildingId: idSchema,
    radius: z.number().finite().positive(),
    level: z.union([z.literal(1), z.literal(2)]),
  }))();

export const unitEntitySchema = (() =>
  entitySchema.safeExtend({
    ownerId: idSchema,
    unitId: idSchema,
    radius: z.number().finite().positive(),
  }))();

export const snapshotSchema = (() =>
  z.strictObject({
    tick: z.number().int().nonnegative(),
    entities: z
      .array(playerEntitySchema)
      .max(MAX_SNAPSHOT_ENTITIES)
      .refine(
        (entities) =>
          new Set(entities.map(({ id }) => id)).size === entities.length,
        "Duplicate entity ID",
      ),
    buildings: z
      .array(buildingEntitySchema)
      .max(MAX_SNAPSHOT_ENTITIES)
      .refine(
        (buildings) =>
          new Set(buildings.map(({ id }) => id)).size === buildings.length,
        "Duplicate building ID",
      ),
    units: z
      .array(unitEntitySchema)
      .max(MAX_SNAPSHOT_ENTITIES)
      .refine(
        (units) => new Set(units.map(({ id }) => id)).size === units.length,
        "Duplicate unit ID",
      ),
    resources: z.strictObject({
      gold: z.number().finite().nonnegative(),
      wood: z.number().finite().nonnegative(),
      rage: z.number().finite().nonnegative(),
    }),
    phase: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    timeLeftSeconds: z.number().finite().nonnegative(),
  }))();

export const clientMessageSchema = (() =>
  z.discriminatedUnion("t", [
    z.strictObject({
      v: z.literal(PROTOCOL_VERSION),
      t: z.literal("ping"),
      requestId: idSchema,
    }),
    z.strictObject({
      v: z.literal(PROTOCOL_VERSION),
      t: z.literal("intent"),
      requestId: idSchema,
      intent: intentSchema,
    }),
  ]))();

export const serverMessageSchema = (() =>
  z.discriminatedUnion("t", [
    z.strictObject({
      v: z.literal(PROTOCOL_VERSION),
      t: z.literal("welcome"),
      playerId: idSchema,
      roomId: idSchema,
      match: matchSchema,
      map: forestMapSchema,
      buildingDefinitions: buildingsSchema,
      unitDefinitions: unitsSchema,
      heroDefinitions: unitsSchema,
    }),
    z.strictObject({
      v: z.literal(PROTOCOL_VERSION),
      t: z.literal("pong"),
      requestId: idSchema,
    }),
    z.strictObject({
      v: z.literal(PROTOCOL_VERSION),
      t: z.literal("error"),
      code: z.enum([
        "INVALID_MESSAGE",
        "UNSUPPORTED_INTENT",
        "RATE_LIMITED",
        "INVALID_TARGET",
        "ROOM_FULL",
        "ROLE_TAKEN",
        "ACTION_FORBIDDEN",
        "INSUFFICIENT_RESOURCES",
        "BUILD_LIMIT_REACHED",
        "MATCH_ENDED",
        "INVALID_BUILDING",
        "INVALID_UNIT",
        "UNIT_LIMIT_REACHED",
        "SPAWN_BLOCKED",
        "NOT_OWNER",
        "MAX_LEVEL",
        "OUT_OF_RANGE",
      ]),
      requestId: idSchema.optional(),
    }),
    z.strictObject({
      v: z.literal(PROTOCOL_VERSION),
      t: z.literal("snapshot"),
      ...snapshotSchema.shape,
    }),
  ]))();

export type Intent = z.infer<typeof intentSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;

const decodeMessage = <Schema extends z.ZodType>(
  text: string,
  schema: Schema,
): z.output<Schema> | null => {
  if (new TextEncoder().encode(text).byteLength > MAX_MESSAGE_BYTES)
    return null;
  try {
    const input: unknown = JSON.parse(text);
    const result = schema.safeParse(input);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

export const decodeClientMessage = (text: string): ClientMessage | null =>
  decodeMessage(text, clientMessageSchema);
export const decodeServerMessage = (text: string): ServerMessage | null =>
  decodeMessage(text, serverMessageSchema);

export type ErrorCode = Extract<ServerMessage, { t: "error" }>["code"];
