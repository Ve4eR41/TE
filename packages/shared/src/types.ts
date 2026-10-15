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

/** Authoritative constructed building state. */
export interface BuildingEntity extends Entity {
  readonly ownerId: PlayerId;
  readonly buildingId: string;
  readonly radius: number;
  readonly level: 1 | 2;
}

/** Authoritative hired unit; avatars stay in snapshot.entities. */
export interface UnitEntity extends Entity {
  readonly ownerId: PlayerId;
  readonly unitId: string;
  readonly radius: number;
}

/** Player avatar with server-authoritative progression and movement speed. */
export interface PlayerEntity extends Entity {
  readonly ownerId: PlayerId;
  readonly level: number;
  readonly speedUnitsPerSecond: number;
}
