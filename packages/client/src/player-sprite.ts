import { Container, Graphics, Text } from "pixi.js";
import type { Entity, PlayerEntity } from "@troll-vs-elves/shared";

const PALETTE = (() => ({
  troll: 0xc1a477,
  elves: 0xb8db98,
  ring: 0xe5df9d,
}))();
export const createPlayerSprite = (
  entity: Entity,
  own: boolean,
  guard = false,
  hero?: PlayerEntity,
): Container => {
  const root = new Container();
  const troll = entity.team === "troll";
  root.addChild(
    new Graphics()
      .ellipse(0, 4, troll ? 22 : 16, 9)
      .fill({ color: 0x081e17, alpha: 0.5 }),
  );
  if (own)
    root.addChild(
      new Graphics()
        .ellipse(0, 4, troll ? 26 : 20, 12)
        .stroke({ width: 2, color: PALETTE.ring, alpha: 0.9 }),
    );
  const body = new Graphics();
  if (troll) {
    body
      .roundRect(-19, -28, 38, 32, 10)
      .fill(0x6f8060)
      .roundRect(-13, -11, 26, 15, 4)
      .fill(0x65533b)
      .ellipse(0, -32, 16, 15)
      .fill(0x91a17a)
      .poly([-14, -39, -25, -38, -15, -27])
      .fill(0x91a17a)
      .poly([14, -39, 25, -38, 15, -27])
      .fill(0x91a17a)
      .circle(-6, -34, 2)
      .circle(6, -34, 2)
      .fill(0x243529)
      .poly([-9, -24, -7, -32, -3, -23])
      .poly([9, -24, 7, -32, 3, -23])
      .fill(0xede3bd)
      .moveTo(22, -6)
      .lineTo(28, -39)
      .stroke({ width: 7, color: 0x8a704b })
      .roundRect(20, -47, 17, 22, 5)
      .fill(0x9d8155);
  } else {
    body
      .poly([-14, 1, 0, -31, 14, 1])
      .fill(0x598355)
      .ellipse(0, -28, 10, 12)
      .fill(0xdbcba3)
      .poly([-13, -30, 0, -48, 13, -30, 0, -38])
      .fill(0x7ba567)
      .poly([-9, -30, -17, -34, -10, -23])
      .poly([9, -30, 17, -34, 10, -23])
      .fill(0xdbcba3)
      .circle(-4, -29, 1.5)
      .circle(4, -29, 1.5)
      .fill(0x263e30)
      .moveTo(17, -33)
      .quadraticCurveTo(31, -17, 17, -1)
      .stroke({ width: 3, color: 0xb69b69 })
      .moveTo(17, -33)
      .lineTo(17, -1)
      .stroke({ width: 1, color: 0xe0d3a3 });
  }
  if (guard)
    body
      .poly([-13, -22, 1, -22, 0, -9, -6, -3, -12, -9])
      .fill(0xa9bd91)
      .stroke({ width: 2, color: 0x586d55 });
  root.addChild(body);
  const label = new Text({
    text: `${guard ? (own ? "ВАШ СТРАЖ" : "СТРАЖ") : `${own ? "ВЫ · " : ""}${troll ? "ТРОЛЛЬ" : "ЭЛЬФ"}`}`,
    style: {
      fontFamily: "system-ui",
      fontSize: 11,
      fontWeight: "600",
      fill: own ? 0xf2e9b5 : PALETTE[entity.team],
      stroke: { color: 0x152b22, width: 3 },
    },
  });
  if (troll && hero) {
    label.text += ` · ${hero.level} УР.`;
    const hp = new Graphics()
      .roundRect(-22, -64, 44, 4, 2)
      .fill(0x1a3024)
      .roundRect(-22, -64, (44 * hero.hp) / hero.maxHp, 4, 2)
      .fill(0xb7ce90);
    label.y = -69;
    root.addChild(hp);
  }
  label.anchor.set(0.5, 1);
  label.position.set(0, troll && hero ? -69 : -53);
  root.addChild(label);
  return root;
};
