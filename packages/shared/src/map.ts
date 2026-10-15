import { z } from "zod";
import type { Position } from "./types.js";

const pointSchema = (() =>
  z.strictObject({ x: z.number().finite(), y: z.number().finite() }))();
const ellipseSchema = (() =>
  z.strictObject({
    ...pointSchema.shape,
    radiusX: z.number().finite().positive(),
    radiusY: z.number().finite().positive(),
  }))();

export const isWalkable = (map: ForestMap, point: Position): boolean => {
  const r = map.avatarRadius;
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < map.bounds.left + r ||
    point.x > map.bounds.right - r ||
    point.y < map.bounds.top + r ||
    point.y > map.bounds.bottom - r
  )
    return false;
  return map.obstacles.every(
    (obstacle) =>
      ((point.x - obstacle.x) / (obstacle.radiusX + r)) ** 2 +
        ((point.y - obstacle.y) / (obstacle.radiusY + r)) ** 2 >=
      1,
  );
};

const mapObjectSchema = (() =>
  z.strictObject({
    id: z.literal("forest"),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    bounds: z.strictObject({
      left: z.number().finite().nonnegative(),
      right: z.number().finite().positive(),
      top: z.number().finite().nonnegative(),
      bottom: z.number().finite().positive(),
    }),
    avatarRadius: z.number().finite().positive(),
    spawns: z.array(pointSchema).min(1).max(16),
    trees: z
      .array(
        z.strictObject({
          ...pointSchema.shape,
          scale: z.number().finite().positive(),
          ancient: z.boolean().optional(),
        }),
      )
      .max(128),
    pond: ellipseSchema,
    obstacles: z.array(ellipseSchema).max(128),
  }))();
export type ForestMap = z.infer<typeof mapObjectSchema>;
export const forestMapSchema = (() =>
  mapObjectSchema.superRefine((map, context) => {
    const { left, right, top, bottom } = map.bounds;
    if (
      right > map.width ||
      bottom > map.height ||
      right - left <= map.avatarRadius * 2 ||
      bottom - top <= map.avatarRadius * 2
    )
      context.addIssue({
        code: "custom",
        path: ["bounds"],
        message: "Walk bounds must fit the map and avatar",
      });
    map.spawns.forEach((spawn, index) => {
      if (!isWalkable(map, spawn))
        context.addIssue({
          code: "custom",
          path: ["spawns", index],
          message: "Spawn must be walkable",
        });
    });
  }))();
