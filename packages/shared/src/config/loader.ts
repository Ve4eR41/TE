import { readConfigFile } from "./read-config-file.js";
import {
  abilitiesSchema,
  buildingsSchema,
  classesSchema,
  itemsSchema,
  matchSchema,
  unitsSchema,
} from "./schemas.js";
import type { GameConfig } from "./types.js";
import { forestMapSchema, type ForestMap } from "../map.js";
export const loadConfig = (rootDir: string): GameConfig => ({
  match: readConfigFile(rootDir, "match.json", matchSchema),
  units: readConfigFile(rootDir, "units.json", unitsSchema),
  buildings: readConfigFile(rootDir, "buildings.json", buildingsSchema),
  items: readConfigFile(rootDir, "items.json", itemsSchema),
  classes: readConfigFile(rootDir, "classes.json", classesSchema),
  abilities: readConfigFile(rootDir, "abilities.json", abilitiesSchema),
});

export const loadMap = (rootDir: string): ForestMap =>
  readConfigFile(rootDir, "maps/forest.json", forestMapSchema);
