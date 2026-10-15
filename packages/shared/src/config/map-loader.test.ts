import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMap } from "./loader.js";
import { ConfigError } from "./error.js";
describe("map loading", () => {
  it("loads the repository forest with valid spawns", () => {
    expect(
      loadMap(fileURLToPath(new URL("../../../../config/", import.meta.url)))
        .spawns,
    ).toHaveLength(8);
  });
  it("reports the map file when missing", () => {
    expect(() => loadMap("/missing-game-config")).toThrow(ConfigError);
  });
});
