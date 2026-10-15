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
describe("match clock", () => {
  it("starts on join, switches at phase boundaries and stops at zero", () => {
    const room = new MatchRoom(match, makeMap());
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
    const room = new MatchRoom(match, makeMap());
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
