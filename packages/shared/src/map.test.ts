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
import { forestMapSchema, isWalkable } from "./map.js";
describe("forest geometry", () => {
  it("validates a map and applies radius at boundaries and obstacles", () => {
    const map = forestMapSchema.parse(makeMap());
    expect(isWalkable(map, { x: 114, y: 445 })).toBe(true);
    expect(isWalkable(map, { x: 113, y: 445 })).toBe(false);
    expect(isWalkable(map, { x: 455, y: 305 })).toBe(false);
  });
  it.each([
    { bounds: { left: 0, right: 1000, top: 0, bottom: 700 } },
    { spawns: [{ x: 455, y: 305 }] },
    { obstacles: [{ x: 1, y: 2, radiusX: 0, radiusY: 2 }] },
    { width: Infinity },
  ])("rejects invalid geometry %j", (change) => {
    expect(forestMapSchema.safeParse({ ...makeMap(), ...change }).success).toBe(
      false,
    );
  });
});
