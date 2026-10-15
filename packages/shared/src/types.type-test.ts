import type {
  Entity,
  EntityId,
  Phase,
  PlayerId,
  Position,
  Resources,
  Team,
} from "./index.js";

// Checked by tsc, excluded from builds and never executed.
export const checkBaseTypeContracts = () => {
  const id: EntityId = "test-entity";
  const ownerId: PlayerId = "test-player";
  const team: Team = "troll";
  const phase: Phase = 3;
  const resources: Resources = { gold: 0, wood: 0, rage: 0 };
  const position: Position = { x: 0, y: 0 };
  const entity: Entity = { id, ownerId, team, position, hp: 1, maxHp: 1 };
  const unownedEntity: Entity = { ...entity, ownerId: null, team: "elves" };

  // @ts-expect-error — team names are a closed union.
  const invalidTeam: Team = "neutral";
  // @ts-expect-error — only three phases exist.
  const invalidPhase: Phase = 4;
  // @ts-expect-error — every resource is required.
  const incompleteResources: Resources = { gold: 0, wood: 0 };
  // @ts-expect-error — entity identifiers are strings.
  const invalidId: EntityId = 1;
  // @ts-expect-error — ownership must be explicit, including null.
  const missingOwner: Entity = { id, team, position, hp: 1, maxHp: 1 };
  // @ts-expect-error — fields of resources are readonly.
  resources.gold = 1;
  // @ts-expect-error — entity fields are readonly.
  entity.hp = 0;
  // @ts-expect-error — nested position fields are readonly too.
  entity.position.x = 1;

  return {
    entity,
    unownedEntity,
    resources,
    position,
    phase,
    team,
    invalidTeam,
    invalidPhase,
    incompleteResources,
    invalidId,
    missingOwner,
  };
};
