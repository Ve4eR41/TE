import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError } from "./error.js";
import { loadConfig } from "./loader.js";

const fixtureDirectories = (() => [] as string[])();

const makeData = () => ({
  match: {
    durationSeconds: 1800,
    tickRateHz: 20,
    phaseStartSeconds: [0, 600, 1200],
  },
  units: [
    {
      id: "test-scout",
      name: "Test scout",
      hp: 100,
      speedUnitsPerSecond: 3,
      attackDamage: 5,
      cost: { gold: 10, wood: 0 },
    },
  ],
  buildings: [
    {
      id: "test-wall",
      name: "Test wall",
      hp: 100,
      cost: { gold: 0, wood: 10 },
    },
  ],
  items: [{ id: "test-item", name: "Test item", cost: { gold: 1, wood: 0 } }],
  classes: [{ id: "test-class", name: "Test class" }],
  abilities: [{ id: "test-ability", name: "Test ability", cooldownSeconds: 1 }],
});

const makeFixture = (overrides: Record<string, unknown> = {}): string => {
  const root = mkdtempSync(join(tmpdir(), "troll-vs-elves-config-"));
  fixtureDirectories.push(root);
  for (const [key, value] of Object.entries({ ...makeData(), ...overrides })) {
    writeFileSync(join(root, `${key}.json`), JSON.stringify(value));
  }
  return root;
};

const getError = (root: string): ConfigError => {
  try {
    loadConfig(root);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ConfigError);
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error("Expected loadConfig to fail");
};

afterEach(() => {
  for (const root of fixtureDirectories.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("loadConfig", () => {
  it("loads and preserves all fields of a valid configuration", () => {
    expect(loadConfig(makeFixture())).toEqual(makeData());
  });

  it("accepts empty entity lists", () => {
    const root = makeFixture({
      units: [],
      buildings: [],
      items: [],
      classes: [],
      abilities: [],
    });
    expect(loadConfig(root).units).toEqual([]);
  });

  it.each(["match", "units", "buildings", "items", "classes", "abilities"])(
    "reports a missing %s.json file",
    (name) => {
      const root = makeFixture();
      rmSync(join(root, `${name}.json`));
      const error = getError(root);
      expect(error.filePath).toBe(join(root, `${name}.json`));
      expect(error.issues[0]?.path).toEqual([]);
      expect(error.message).toContain(`${name}.json`);
    },
  );

  it("wraps read errors for a non-directory root", () => {
    const root = makeFixture();
    const error = getError(join(root, "match.json"));
    expect(error.filePath).toBe(join(root, "match.json", "match.json"));
    expect(error.issues[0]?.path).toEqual([]);
  });

  it("wraps invalid JSON without exposing the file contents", () => {
    const root = makeFixture();
    writeFileSync(join(root, "units.json"), '{"private-marker":');
    const error = getError(root);
    expect(error.filePath).toBe(join(root, "units.json"));
    expect(error.issues[0]?.path).toEqual([]);
    expect(error.message).not.toContain("private-marker");
  });

  it("reports a nested field path and file for invalid HP", () => {
    const unit = makeData().units[0];
    const root = makeFixture({ units: [{ ...unit, hp: -1 }] });
    const error = getError(root);
    expect(error.filePath).toBe(join(root, "units.json"));
    expect(error.issues).toContainEqual({
      path: [0, "hp"],
      message: expect.any(String),
    });
    expect(error.message).toContain("0.hp");
  });

  it.each([
    { units: [{ ...makeData().units[0], extra: true }] },
    { match: { ...makeData().match, extra: true } },
    {
      items: [{ ...makeData().items[0], cost: { gold: 1, wood: 0, extra: 1 } }],
    },
  ])("rejects unknown keys: %j", (overrides) => {
    expect(() => loadConfig(makeFixture(overrides))).toThrow(ConfigError);
  });

  it.each(["units", "buildings", "items", "classes", "abilities"] as const)(
    "rejects duplicate IDs in %s",
    (name) => {
      const entries = makeData()[name];
      const root = makeFixture({ [name]: [entries[0], entries[0]] });
      const error = getError(root);
      expect(error.filePath).toBe(join(root, `${name}.json`));
      expect(error.issues).toContainEqual({
        path: [1, "id"],
        message: expect.any(String),
      });
    },
  );

  it.each(["", " test-id", "test-id ", "   "])(
    "rejects ID %j without normalizing",
    (id) => {
      expect(() =>
        loadConfig(makeFixture({ classes: [{ id, name: "Test" }] })),
      ).toThrow(ConfigError);
    },
  );

  it("rejects whitespace-only names but preserves valid names", () => {
    expect(() =>
      loadConfig(makeFixture({ classes: [{ id: "test", name: "  " }] })),
    ).toThrow(ConfigError);
    const root = makeFixture({ classes: [{ id: "test", name: " Test " }] });
    expect(loadConfig(root).classes[0]?.name).toBe(" Test ");
  });

  it.each([
    [1, 600, 1200],
    [0, 600, 600],
    [0, 1200, 600],
    [0, 600, 1800],
    [0, 600],
    [0, 600, 1200, 1500],
    [0, -1, 1200],
    [0, 0.5, 1200],
  ])("rejects invalid phase starts %j", (...phaseStartSeconds) => {
    const root = makeFixture({
      match: { ...makeData().match, phaseStartSeconds },
    });
    expect(getError(root).filePath).toBe(join(root, "match.json"));
  });

  it.each([0, -1, 1.5])("rejects invalid tick rate %s", (tickRateHz) => {
    expect(() =>
      loadConfig(makeFixture({ match: { ...makeData().match, tickRateHz } })),
    ).toThrow(ConfigError);
  });

  it.each([
    { hp: 1.5 },
    { attackDamage: -1 },
    { speedUnitsPerSecond: -1 },
    { cost: { gold: 0.5, wood: 0 } },
    { cost: { gold: 0, wood: -1 } },
  ])("rejects invalid unit fields %j", (fields) => {
    expect(() =>
      loadConfig(
        makeFixture({ units: [{ ...makeData().units[0], ...fields }] }),
      ),
    ).toThrow(ConfigError);
  });

  it("rejects non-finite JSON numbers", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "abilities.json"),
      '[{"id":"test","name":"Test","cooldownSeconds":1e999}]',
    );
    expect(() => loadConfig(root)).toThrow(ConfigError);
  });

  it("does not hard-code match timing", () => {
    const match = {
      durationSeconds: 90,
      tickRateHz: 10,
      phaseStartSeconds: [0, 30, 60],
    };
    expect(loadConfig(makeFixture({ match })).match).toEqual(match);
  });

  it("uses the supplied root without relying on fixtures in cwd or caching", () => {
    const first = makeFixture();
    const second = makeFixture({ classes: [] });
    expect(resolve(first)).not.toBe(process.cwd());
    expect(loadConfig(first).classes).toHaveLength(1);
    expect(loadConfig(relative(process.cwd(), second)).classes).toEqual([]);
    writeFileSync(join(first, "classes.json"), "[]");
    expect(loadConfig(first).classes).toEqual([]);
  });

  it("loads the checked-in configuration examples", () => {
    const root = new URL("../../../../config/", import.meta.url);
    expect(loadConfig(root.pathname).match).toEqual(
      JSON.parse(readFileSync(new URL("match.json", root), "utf8")),
    );
  });
});
