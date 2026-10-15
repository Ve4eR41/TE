import { describe, expect, it } from "vitest";
import { getCameraTransform } from "./camera.js";

const WORLD = (() => ({ width: 960, height: 700 }))();
describe("camera fills the viewport and follows the hero", () => {
  it("fills a wide viewport without stretching and follows vertical movement", () => {
    const top = getCameraTransform(
      WORLD,
      { width: 1440, height: 600 },
      { x: 160, y: 140 },
    );
    const bottom = getCameraTransform(
      WORLD,
      { width: 1440, height: 600 },
      { x: 800, y: 640 },
    );
    expect(top).toEqual({ scale: 1.5, x: 0, y: 0 });
    expect(bottom).toEqual({ scale: 1.5, x: 0, y: -450 });
  });
  it("follows horizontal movement in portrait and clamps both edges", () => {
    const viewport = { width: 390, height: 500 };
    const left = getCameraTransform(WORLD, viewport, { x: 100, y: 400 });
    const middle = getCameraTransform(WORLD, viewport, { x: 480, y: 400 });
    const right = getCameraTransform(WORLD, viewport, { x: 870, y: 400 });
    expect(left.x).toBe(0);
    expect(middle.x + 480 * middle.scale).toBeCloseTo(viewport.width / 2);
    expect(right.x + WORLD.width * right.scale).toBeCloseTo(viewport.width);
    expect(right.y).toBe(0);
    expect(right.scale).toBeCloseTo(500 / 700);
  });
  it.each([
    { width: 320, height: 170 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 },
  ])("covers every viewport corner on resize: %j", (viewport) => {
    const transform = getCameraTransform(WORLD, viewport, { x: 590, y: 445 });
    expect(transform.x).toBeLessThanOrEqual(0);
    expect(transform.y).toBeLessThanOrEqual(0);
    expect(transform.x + WORLD.width * transform.scale).toBeGreaterThanOrEqual(
      viewport.width - 0.001,
    );
    expect(transform.y + WORLD.height * transform.scale).toBeGreaterThanOrEqual(
      viewport.height - 0.001,
    );
  });
});
