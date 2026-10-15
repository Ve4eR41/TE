import type { Position } from "@troll-vs-elves/shared";

export const getCameraTransform = (
  world: { width: number; height: number },
  viewport: { width: number; height: number },
  focus: Position,
): { x: number; y: number; scale: number } => {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const scale = Math.max(width / world.width, height / world.height);
  const x = Math.max(
    width - world.width * scale,
    Math.min(0, width / 2 - focus.x * scale),
  );
  const y = Math.max(
    height - world.height * scale,
    Math.min(0, height / 2 - focus.y * scale),
  );
  return { x, y, scale };
};
