import { randomUUID } from "node:crypto";
import {
  PROTOCOL_VERSION,
  canWalkSegment,
  isWalkable,
  MAX_SNAPSHOT_ENTITIES,
  type BuildingEntity,
  type UnitEntity,
  type BuildingConfig,
  type ErrorCode,
  type PlayerEntity,
  type EconomyConfig,
  type Resources,
  type Team,
  type Intent,
  type Position,
  type UnitConfig,
  type MatchConfig,
  type ForestMap,
  type ServerMessage,
  type Snapshot,
} from "@troll-vs-elves/shared";

const MOVEMENT = (() => ({ maxCatchUpTicks: 2, steerTimeoutSeconds: 0.6 }))();
interface Avatar {
  entity: PlayerEntity;
  spawnIndex: number;
  resources: Resources;
  target?: Position;
  direction?: Position;
  steerUpdatedAt: number;
}

export class MatchRoom {
  readonly id = randomUUID();
  private elapsedSeconds = 0;
  private tick = 0;
  private readonly structures = new Map<string, BuildingEntity>();
  private readonly recruits = new Map<string, UnitEntity>();
  private readonly avatars = new Map<string, Avatar>();

  constructor(
    readonly match: MatchConfig,
    readonly map: ForestMap,
    readonly units: readonly UnitConfig[],
    readonly economy: EconomyConfig,
    readonly buildingDefinitions: readonly BuildingConfig[] = [],
  ) {
    for (const team of ["troll", "elves"] as const) {
      if (
        !units.some((unit) => unit.id === team && unit.speedUnitsPerSecond > 0)
      )
        throw new Error(`Missing playable unit: ${team}`);
    }
  }

  get size(): number {
    return this.avatars.size;
  }

  get trollAvailable(): boolean {
    return ![...this.avatars.values()].some(
      ({ entity }) => entity.team === "troll",
    );
  }

  join(preferredTeam?: Team): string {
    if (this.size >= this.map.spawns.length) throw new Error("Room full");
    if (preferredTeam === "troll" && !this.trollAvailable)
      throw new Error("Troll unavailable");
    const playerId = randomUUID();
    const spawnIndex = this.map.spawns.findIndex(
      (_, index) =>
        ![...this.avatars.values()].some(
          (avatar) => avatar.spawnIndex === index,
        ),
    );
    const spawn = this.map.spawns[spawnIndex];
    const team = preferredTeam ?? (this.trollAvailable ? "troll" : "elves");
    const unit = this.units.find(({ id }) => id === team);
    if (!spawn || !unit) throw new Error("Cannot spawn avatar");
    this.avatars.set(playerId, {
      spawnIndex,
      resources: { ...this.economy.starting[team] },
      steerUpdatedAt: 0,
      entity: {
        id: playerId,
        ownerId: playerId,
        team,
        position: { ...spawn },
        hp: unit.hp,
        maxHp: unit.hp,
        level: 1,
        speedUnitsPerSecond: unit.speedUnitsPerSecond,
      },
    });
    return playerId;
  }

  leave(playerId: string): void {
    for (const [id, structure] of this.structures) {
      if (structure.ownerId === playerId) this.structures.delete(id);
    }
    for (const [id, unit] of this.recruits) {
      if (unit.ownerId === playerId) this.recruits.delete(id);
    }
    this.avatars.delete(playerId);
    if (!this.size) {
      this.elapsedSeconds = 0;
      this.tick = 0;
    }
  }

  advance(deltaSeconds: number): void {
    if (!this.size || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0)
      return;
    const remaining = this.match.durationSeconds - this.elapsedSeconds;
    const movementSeconds = Math.min(
      deltaSeconds,
      MOVEMENT.maxCatchUpTicks / this.match.tickRateHz,
      remaining,
    );
    this.elapsedSeconds = Math.min(
      this.match.durationSeconds,
      this.elapsedSeconds + deltaSeconds,
    );
    const incomeSeconds = Math.min(deltaSeconds, remaining);
    for (const avatar of this.avatars.values()) {
      const income = { ...this.economy.incomePerSecond[avatar.entity.team] };
      for (const building of this.structures.values()) {
        if (building.ownerId !== avatar.entity.id) continue;
        const definition = this.buildingDefinitions.find(
          ({ id }) => id === building.buildingId,
        );
        const bonus =
          (building.level === 2
            ? definition?.upgrade?.incomePerSecond
            : undefined) ?? definition?.incomePerSecond;
        if (!bonus) continue;
        income.gold += bonus.gold;
        income.wood += bonus.wood;
        income.rage += bonus.rage;
      }
      avatar.resources = {
        gold: avatar.resources.gold + income.gold * incomeSeconds,
        wood: avatar.resources.wood + income.wood * incomeSeconds,
        rage: avatar.resources.rage + income.rage * incomeSeconds,
      };
      const from = avatar.entity.position;
      const direction =
        avatar.direction &&
        this.elapsedSeconds - avatar.steerUpdatedAt <=
          MOVEMENT.steerTimeoutSeconds
          ? avatar.direction
          : undefined;
      const dx = direction?.x ?? (avatar.target?.x ?? from.x) - from.x;
      const dy = direction?.y ?? (avatar.target?.y ?? from.y) - from.y;
      const distance = Math.hypot(dx, dy);
      if (!distance || movementSeconds <= 0) continue;
      const step = direction
        ? avatar.entity.speedUnitsPerSecond * movementSeconds
        : Math.min(
            distance,
            avatar.entity.speedUnitsPerSecond * movementSeconds,
          );
      const to = {
        x: from.x + (dx / distance) * step,
        y: from.y + (dy / distance) * step,
      };
      if (canWalkSegment(this.collisionMap, from, to))
        avatar.entity = { ...avatar.entity, position: to };
      else delete avatar.target;
    }
    this.advanceRecruits(movementSeconds);
    this.tick += 1;
  }

  intent(playerId: string, intent: Intent): ErrorCode | null {
    const avatar = this.avatars.get(playerId);
    if (!avatar) return "INVALID_TARGET";
    if (this.elapsedSeconds >= this.match.durationSeconds) return "MATCH_ENDED";
    if (intent.t === "hire") return this.hire(playerId, avatar, intent.unitId);
    if (intent.t === "build") return this.build(playerId, avatar, intent);
    if (intent.t === "upgrade")
      return this.upgrade(playerId, avatar, intent.entityId);
    if (intent.t === "move") {
      if (!isWalkable(this.collisionMap, intent)) return "INVALID_TARGET";
      avatar.target = { x: intent.x, y: intent.y };
      delete avatar.direction;
      return null;
    }
    if (intent.t === "steer") {
      delete avatar.target;
      avatar.direction = { x: intent.x, y: intent.y };
      avatar.steerUpdatedAt = this.elapsedSeconds;
      return null;
    }
    return "UNSUPPORTED_INTENT";
  }

  private get collisionMap(): ForestMap {
    return {
      ...this.map,
      obstacles: [
        ...this.map.obstacles,
        ...[...this.structures.values()].map((building) => ({
          ...building.position,
          radiusX: building.radius,
          radiusY: building.radius,
        })),
      ],
    };
  }

  private build(
    playerId: string,
    avatar: Avatar,
    intent: Extract<Intent, { t: "build" }>,
  ): ErrorCode | null {
    if (avatar.entity.team !== "elves") return "ACTION_FORBIDDEN";
    const definition = this.buildingDefinitions.find(
      ({ id }) => id === intent.buildingId,
    );
    if (!definition) return "INVALID_BUILDING";
    const position = { x: intent.x, y: intent.y };
    if (
      Math.hypot(
        position.x - avatar.entity.position.x,
        position.y - avatar.entity.position.y,
      ) > definition.buildRangeUnits
    )
      return "OUT_OF_RANGE";
    const ownCount = [...this.structures.values()].filter(
      (building) =>
        building.ownerId === playerId && building.buildingId === definition.id,
    ).length;
    if (
      ownCount >= definition.maxPerPlayer ||
      this.structures.size >= MAX_SNAPSHOT_ENTITIES - this.map.spawns.length
    )
      return "BUILD_LIMIT_REACHED";
    if (
      !isWalkable(
        { ...this.collisionMap, avatarRadius: definition.radius },
        position,
      ) ||
      this.map.spawns.some(
        (spawn) =>
          Math.hypot(spawn.x - position.x, spawn.y - position.y) <=
          definition.radius + this.map.avatarRadius,
      ) ||
      [...this.recruits.values()].some(
        (unit) =>
          Math.hypot(
            unit.position.x - position.x,
            unit.position.y - position.y,
          ) <=
          definition.radius + unit.radius,
      ) ||
      [...this.avatars.values()].some(
        ({ entity }) =>
          Math.hypot(
            entity.position.x - position.x,
            entity.position.y - position.y,
          ) <=
          definition.radius + this.map.avatarRadius,
      )
    )
      return "INVALID_TARGET";
    if (
      avatar.resources.gold < definition.cost.gold ||
      avatar.resources.wood < definition.cost.wood
    )
      return "INSUFFICIENT_RESOURCES";
    const id = randomUUID();
    avatar.resources = {
      ...avatar.resources,
      gold: avatar.resources.gold - definition.cost.gold,
      wood: avatar.resources.wood - definition.cost.wood,
    };
    this.structures.set(id, {
      id,
      ownerId: playerId,
      team: "elves",
      position,
      hp: definition.hp,
      maxHp: definition.hp,
      buildingId: definition.id,
      radius: definition.radius,
      level: 1,
    });
    return null;
  }

  private hire(
    playerId: string,
    avatar: Avatar,
    unitId: string,
  ): ErrorCode | null {
    if (avatar.entity.team !== "elves") return "ACTION_FORBIDDEN";
    const definition = this.units.find(({ id }) => id === unitId);
    const settings = definition?.recruitment;
    if (!definition || !settings) return "INVALID_UNIT";
    if (
      [...this.recruits.values()].filter(
        (unit) => unit.ownerId === playerId && unit.unitId === unitId,
      ).length >= settings.maxPerPlayer ||
      this.recruits.size >= MAX_SNAPSHOT_ENTITIES
    )
      return "UNIT_LIMIT_REACHED";
    if (
      avatar.resources.gold < definition.cost.gold ||
      avatar.resources.wood < definition.cost.wood
    )
      return "INSUFFICIENT_RESOURCES";
    const collisionMap = {
      ...this.collisionMap,
      avatarRadius: settings.radius,
    };
    const position = settings.spawnOffsets
      .map((offset) => ({
        x: avatar.entity.position.x + offset.x,
        y: avatar.entity.position.y + offset.y,
      }))
      .find(
        (point) =>
          isWalkable(collisionMap, point) &&
          canWalkSegment(collisionMap, avatar.entity.position, point) &&
          !this.map.spawns.some(
            (spawn) =>
              Math.hypot(spawn.x - point.x, spawn.y - point.y) <=
              this.map.avatarRadius + settings.radius,
          ) &&
          ![...this.avatars.values()].some(
            ({ entity }) =>
              Math.hypot(
                entity.position.x - point.x,
                entity.position.y - point.y,
              ) <=
              this.map.avatarRadius + settings.radius,
          ) &&
          ![...this.recruits.values()].some(
            (unit) =>
              Math.hypot(
                unit.position.x - point.x,
                unit.position.y - point.y,
              ) <=
              unit.radius + settings.radius,
          ),
      );
    if (!position) return "SPAWN_BLOCKED";
    const id = randomUUID();
    avatar.resources = {
      ...avatar.resources,
      gold: avatar.resources.gold - definition.cost.gold,
      wood: avatar.resources.wood - definition.cost.wood,
    };
    this.recruits.set(id, {
      id,
      ownerId: playerId,
      team: "elves",
      position,
      hp: definition.hp,
      maxHp: definition.hp,
      unitId,
      radius: settings.radius,
    });
    return null;
  }

  private advanceRecruits(deltaSeconds: number): void {
    if (deltaSeconds <= 0) return;
    const troll = [...this.avatars.values()].find(
      ({ entity }) => entity.team === "troll",
    );
    if (!troll) return;
    for (const [id, unit] of this.recruits) {
      const definition = this.units.find((entry) => entry.id === unit.unitId);
      const settings = definition?.recruitment;
      if (!definition || !settings) continue;
      const dx = troll.entity.position.x - unit.position.x;
      const dy = troll.entity.position.y - unit.position.y;
      const distance = Math.hypot(dx, dy);
      // Also respect physical footprints if a custom config uses a small stop range.
      const stopRange = Math.max(
        settings.stopRangeUnits,
        unit.radius + this.map.avatarRadius,
      );
      if (distance > settings.aggroRangeUnits || distance <= stopRange)
        continue;
      const step = Math.min(
        distance - stopRange,
        definition.speedUnitsPerSecond * deltaSeconds,
      );
      const to = {
        x: unit.position.x + (dx / distance) * step,
        y: unit.position.y + (dy / distance) * step,
      };
      if (
        canWalkSegment(
          { ...this.collisionMap, avatarRadius: unit.radius },
          unit.position,
          to,
        )
      )
        this.recruits.set(id, { ...unit, position: to });
    }
  }

  private upgrade(
    playerId: string,
    avatar: Avatar,
    entityId: string,
  ): ErrorCode | null {
    const targetPlayer = this.avatars.get(entityId);
    if (targetPlayer) {
      if (entityId !== playerId) return "NOT_OWNER";
      if (avatar.entity.team !== "troll") return "ACTION_FORBIDDEN";
      const next = this.units.find(({ id }) => id === "troll")?.progression?.[
        avatar.entity.level - 1
      ];
      if (!next) return "MAX_LEVEL";
      if (
        avatar.resources.gold < next.cost.gold ||
        avatar.resources.wood < next.cost.wood ||
        avatar.resources.rage < next.cost.rage
      )
        return "INSUFFICIENT_RESOURCES";
      avatar.resources = {
        gold: avatar.resources.gold - next.cost.gold,
        wood: avatar.resources.wood - next.cost.wood,
        rage: avatar.resources.rage - next.cost.rage,
      };
      avatar.entity = {
        ...avatar.entity,
        level: avatar.entity.level + 1,
        hp: avatar.entity.hp + next.hp - avatar.entity.maxHp,
        maxHp: next.hp,
        speedUnitsPerSecond: next.speedUnitsPerSecond,
      };
      return null;
    }
    if (avatar.entity.team !== "elves") return "ACTION_FORBIDDEN";
    const building = this.structures.get(entityId);
    if (!building) return "INVALID_TARGET";
    if (building.ownerId !== playerId) return "NOT_OWNER";
    const definition = this.buildingDefinitions.find(
      ({ id }) => id === building.buildingId,
    );
    if (!definition?.upgrade || building.level === 2) return "MAX_LEVEL";
    if (
      Math.hypot(
        building.position.x - avatar.entity.position.x,
        building.position.y - avatar.entity.position.y,
      ) > definition.buildRangeUnits
    )
      return "OUT_OF_RANGE";
    const { cost, hp } = definition.upgrade;
    if (avatar.resources.gold < cost.gold || avatar.resources.wood < cost.wood)
      return "INSUFFICIENT_RESOURCES";
    avatar.resources = {
      ...avatar.resources,
      gold: avatar.resources.gold - cost.gold,
      wood: avatar.resources.wood - cost.wood,
    };
    this.structures.set(entityId, { ...building, hp, maxHp: hp, level: 2 });
    return null;
  }

  snapshot(playerId?: string): Extract<ServerMessage, { t: "snapshot" }> {
    const phase: Snapshot["phase"] =
      this.elapsedSeconds >= this.match.phaseStartSeconds[2]
        ? 3
        : this.elapsedSeconds >= this.match.phaseStartSeconds[1]
          ? 2
          : 1;
    return {
      v: PROTOCOL_VERSION,
      t: "snapshot",
      tick: this.tick,
      entities: [...this.avatars.values()].map(({ entity }) => entity),
      buildings: [...this.structures.values()],
      units: [...this.recruits.values()],
      resources: {
        ...(this.avatars.get(playerId ?? "")?.resources ?? {
          gold: 0,
          wood: 0,
          rage: 0,
        }),
      },
      phase,
      timeLeftSeconds: this.match.durationSeconds - this.elapsedSeconds,
    };
  }

  welcome(playerId: string): ServerMessage {
    return {
      v: PROTOCOL_VERSION,
      t: "welcome",
      playerId,
      roomId: this.id,
      match: this.match,
      map: this.map,
      buildingDefinitions: [...this.buildingDefinitions],
      unitDefinitions: this.units.filter((unit) => unit.recruitment),
      heroDefinitions: this.units.filter((unit) => !unit.recruitment),
    };
  }
}
