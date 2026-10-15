import type { z } from "zod";
import type {
  abilitySchema,
  economySchema,
  buildingSchema,
  classSchema,
  costSchema,
  gameConfigSchema,
  itemSchema,
  matchSchema,
  unitSchema,
} from "./schemas.js";

export type Cost = z.infer<typeof costSchema>;
export type MatchConfig = z.infer<typeof matchSchema>;
export type UnitConfig = z.infer<typeof unitSchema>;
export type BuildingConfig = z.infer<typeof buildingSchema>;
export type ItemConfig = z.infer<typeof itemSchema>;
export type ClassConfig = z.infer<typeof classSchema>;
export type AbilityConfig = z.infer<typeof abilitySchema>;
export type GameConfig = z.infer<typeof gameConfigSchema>;

export type EconomyConfig = z.infer<typeof economySchema>;
