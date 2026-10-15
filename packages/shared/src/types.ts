export type EntityId = string;
export type PlayerId = string;
export type Team = "troll" | "elves";
export type Phase = 1 | 2 | 3;

export interface Resources {
  readonly gold: number;
  readonly wood: number;
  readonly rage: number;
}

/** Coordinates in game units. */
export interface Position {
  readonly x: number;
  readonly y: number;
}

/** Minimal state of a team-owned entity, independent of the wire format. */
export interface Entity {
  readonly id: EntityId;
  readonly ownerId: PlayerId | null;
  readonly team: Team;
  readonly position: Position;
  readonly hp: number;
  readonly maxHp: number;
}
