import { Container, Graphics, Text } from "pixi.js";
import type { BuildingEntity } from "@troll-vs-elves/shared";

export const createBuildingSprite = (
  building: BuildingEntity,
  own: boolean,
): Container => {
  const root = new Container();
  const upgraded = building.level === 2;
  const wall = new Graphics()
    .ellipse(0, 3, 29, 16)
    .fill({ color: 0x10291e, alpha: 0.5 });
  if (own)
    wall
      .ellipse(0, 3, 27, 16)
      .stroke({ width: 1, color: 0xb7d18e, alpha: 0.45 });
  wall.roundRect(-24, -23, 48, 25, 4).fill(upgraded ? 0x677968 : 0x6c573b);
  for (let i = 0; i < 5; i += 1) {
    const x = -22 + i * 10;
    wall
      .poly([x, 2, x, -25, x + 4, -34, x + 8, -25, x + 8, 2])
      .fill(upgraded ? 0xa2b09a : 0xa58b5d)
      .moveTo(x + 2, -20)
      .lineTo(x + 2, -2)
      .stroke({ width: 1, color: upgraded ? 0xd4dcc1 : 0xd0b27a });
  }
  wall.rect(-24, -15, 48, 5).fill(upgraded ? 0x4c6258 : 0x594b34);
  wall
    .roundRect(-22, -43, 44, 4, 2)
    .fill(0x1a3024)
    .roundRect(-22, -43, (44 * building.hp) / building.maxHp, 4, 2)
    .fill(upgraded ? 0xe0d598 : 0xafd28b);
  root.addChild(wall);
  const label = new Text({
    text: `СТЕНА ${building.level}`,
    style: {
      fontFamily: "system-ui",
      fontSize: 10,
      fill: 0xdddcb5,
      stroke: { color: 0x152b22, width: 3 },
    },
  });
  label.anchor.set(0.5, 1);
  label.position.set(0, -48);
  root.addChild(label);
  return root;
};
