import type { ForestMap } from "@troll-vs-elves/shared";
import { Application, Container, Graphics, TilingSprite } from "pixi.js";

const WORLD = (() => ({ width: 960, height: 700, tile: 64 }))();
const COLORS = (() => ({
  ground: 0x344d35,
  moss: 0x435a39,
  shadow: 0x122c25,
  leafDark: 0x1b3c2d,
  leaf: 0x2c5739,
  leafLight: 0x476c40,
  stone: 0x8d9b80,
  stoneDark: 0x536855,
  gold: 0xd3d38c,
}))();

const tree = (
  x: number,
  y: number,
  scale: number,
  ancient = false,
): Container => {
  const group = new Container({ x, y });
  group.scale.set(scale);
  const shadow = new Graphics()
    .ellipse(10, 25, 44, 25)
    .fill({ color: COLORS.shadow, alpha: 0.5 });
  const roots = new Graphics()
    .moveTo(-14, 40)
    .lineTo(0, -15)
    .lineTo(18, 40)
    .stroke({ width: 10, color: 0x726343 });
  const canopy = new Graphics()
    .circle(-20, -8, 30)
    .circle(20, -12, 32)
    .circle(0, -35, 35)
    .fill(COLORS.leafDark)
    .circle(-20, -16, 25)
    .circle(18, -24, 28)
    .circle(0, -44, 29)
    .fill(ancient ? 0x658753 : COLORS.leaf)
    .circle(-22, -22, 15)
    .circle(10, -38, 20)
    .circle(-2, -57, 16)
    .fill(ancient ? 0x8eac66 : COLORS.leafLight);
  group.addChild(shadow, roots, canopy);
  if (ancient) {
    group.addChild(
      new Graphics()
        .circle(0, -30, 11)
        .fill({ color: 0xd6e9a2, alpha: 0.2 })
        .circle(0, -30, 4)
        .fill(0xe2f1ab),
    );
  }
  return group;
};

const stone = (x: number, y: number, rotation: number): Graphics => {
  const graphic = new Graphics()
    .roundRect(-11, -16, 22, 35, 5)
    .fill(COLORS.stoneDark)
    .roundRect(-11, -22, 22, 32, 5)
    .fill(COLORS.stone)
    .moveTo(-6, -16)
    .lineTo(5, -16)
    .stroke({ color: 0xbdc9a6, width: 2 });
  graphic.position.set(x, y);
  graphic.rotation = rotation;
  return graphic;
};

export const createForestScene = async (
  host: HTMLElement,
  map: ForestMap,
): Promise<() => void> => {
  const app = new Application();
  try {
    await app.init({
      resizeTo: host,
      antialias: true,
      background: 0x182d25,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: "webgl",
    });
  } catch (error: unknown) {
    // A renderer may not exist yet when WebGL initialization fails.
    if (app.renderer) app.destroy(true, { children: true });
    throw error;
  }
  host.appendChild(app.canvas);
  const world = new Container();
  app.stage.addChild(world);

  const grass = new Graphics()
    .rect(0, 0, WORLD.tile, WORLD.tile)
    .fill(COLORS.ground);
  for (let index = 0; index < 28; index += 1) {
    const x = 4 + ((index * 17) % (WORLD.tile - 8));
    const y = 4 + ((index * 29) % (WORLD.tile - 8));
    grass
      .ellipse(x, y, 4, 2)
      .fill({ color: index % 2 ? COLORS.moss : 0x51603c, alpha: 0.45 });
    grass
      .moveTo(x, y)
      .lineTo(x + 1, y - 3)
      .stroke({ width: 1, color: 0x82905c, alpha: 0.25 });
  }
  const texture = app.renderer.generateTexture(grass);
  grass.destroy();
  world.addChild(
    new TilingSprite({ texture, width: map.width, height: map.height }),
  );
  world.addChild(
    new Graphics()
      .ellipse(490, 340, 255, 200)
      .fill({ color: 0x74834b, alpha: 0.15 }),
  );

  const trail = (): Graphics =>
    new Graphics()
      .moveTo(-30, 610)
      .bezierCurveTo(240, 540, 180, 410, 390, 390)
      .bezierCurveTo(620, 390, 630, 220, 1010, 140);
  world.addChild(trail().stroke({ width: 82, color: 0x293f2b, alpha: 0.7 }));
  world.addChild(trail().stroke({ width: 65, color: 0x827853, alpha: 0.55 }));
  world.addChild(trail().stroke({ width: 43, color: 0x9a8a60, alpha: 0.2 }));

  const water = new Graphics()
    .ellipse(770, 535, 119, 76)
    .fill(0x263e30)
    .ellipse(765, 530, 111, 68)
    .fill(0x426c5d)
    .ellipse(758, 529, 95, 57)
    .fill(0x2b5c56)
    .ellipse(749, 519, 74, 39)
    .fill({ color: 0x4c8b75, alpha: 0.35 });
  for (let index = 0; index < 7; index += 1) {
    water
      .moveTo(710 + index * 8, 504 + index * 9)
      .lineTo(755 + index * 10, 504 + index * 9)
      .stroke({ width: 1.5, color: 0x9cc4a0, alpha: 0.25 });
  }
  water.pivot.set(765, 530);
  water.position.set(map.pond.x, map.pond.y);
  water.scale.set(map.pond.radiusX / 119, map.pond.radiusY / 76);
  world.addChild(water);
  const details = new Graphics();
  for (let index = 0; index < 60; index += 1) {
    const x = (index * 163 + 92) % map.width;
    const y = (index * 251 + 130) % map.height;
    details.ellipse(x, y, 6, 3).fill({ color: 0x213c2a, alpha: 0.6 });
    if (index % 4 === 0) details.circle(x, y - 2, 2).fill(0xb9b46b);
  }
  world.addChild(details);

  const circle = new Graphics()
    .ellipse(455, 327, 117, 89)
    .fill({ color: 0x1b3b2b, alpha: 0.35 })
    .ellipse(455, 310, 107, 77)
    .stroke({ color: 0xa9b47b, width: 2, alpha: 0.35 })
    .ellipse(455, 310, 91, 63)
    .stroke({ color: 0xa9b47b, width: 1, alpha: 0.2 });
  world.addChild(circle);
  for (let index = 0; index < 9; index += 1) {
    const angle = (index * Math.PI * 2) / 9;
    world.addChild(
      stone(
        455 + Math.cos(angle) * 112,
        310 + Math.sin(angle) * 80,
        angle + Math.PI / 2,
      ),
    );
  }

  const trees = [...map.trees];
  trees
    .sort((left, right) => left.y - right.y)
    .forEach(({ x, y, scale, ancient }) =>
      world.addChild(tree(x, y, scale, ancient)),
    );

  const glow = new Graphics()
    .ellipse(455, 235, 65, 40)
    .fill({ color: 0xc0d482, alpha: 0.08 })
    .ellipse(455, 235, 35, 22)
    .fill({ color: 0xd3e59b, alpha: 0.1 });
  world.addChild(glow);
  const motes = new Graphics();
  for (let index = 0; index < 18; index += 1) {
    motes
      .circle(
        335 + ((index * 47) % 250),
        160 + ((index * 71) % 230),
        index % 3 === 0 ? 2 : 1,
      )
      .fill({ color: COLORS.gold, alpha: 0.7 });
  }
  world.addChild(motes);
  const fit = (): void => {
    const scale = Math.min(
      app.screen.width / map.width,
      app.screen.height / map.height,
    );
    world.scale.set(scale);
    world.position.set(
      (app.screen.width - map.width * scale) / 2,
      (app.screen.height - map.height * scale) / 2,
    );
  };
  const observer = new ResizeObserver(() => {
    app.resize();
    fit();
  });
  observer.observe(host);
  fit();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let elapsed = 0;
  app.ticker.add((ticker) => {
    if (reducedMotion.matches) return;
    elapsed += ticker.deltaMS / 1000;
    glow.alpha = 0.65 + Math.sin(elapsed) * 0.2;
    motes.alpha = 0.6 + Math.sin(elapsed * 0.7) * 0.3;
    motes.y = Math.sin(elapsed * 0.4) * 4;
  });
  return () => {
    observer.disconnect();
    app.destroy(true, { children: true });
    texture.destroy(true);
  };
};
