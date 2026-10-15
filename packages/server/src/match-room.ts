import { randomUUID } from "node:crypto";
import {
  PROTOCOL_VERSION,
  canWalkSegment,
  isWalkable,
  type Entity,
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
  entity: Entity;
  spawnIndex: number;
  speed: number;
  resources: Resources;
  target?: Position;
  direction?: Position;
  steerUpdatedAt: number;
}

export class MatchRoom {
  readonly id = randomUUID();
  private elapsedSeconds = 0;
  private tick = 0;
  private readonly avatars = new Map<string, Avatar>();

  constructor(
    readonly match: MatchConfig,
    readonly map: ForestMap,
    readonly units: readonly UnitConfig[],
    readonly economy: EconomyConfig,
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
      speed: unit.speedUnitsPerSecond,
      resources: { ...this.economy.starting[team] },
      steerUpdatedAt: 0,
      entity: {
        id: playerId,
        ownerId: playerId,
        team,
        position: { ...spawn },
        hp: unit.hp,
        maxHp: unit.hp,
      },
    });
    return playerId;
  }

  leave(playerId: string): void {
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
      const income = this.economy.incomePerSecond[avatar.entity.team];
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
        ? avatar.speed * movementSeconds
        : Math.min(distance, avatar.speed * movementSeconds);
      const to = {
        x: from.x + (dx / distance) * step,
        y: from.y + (dy / distance) * step,
      };
      if (canWalkSegment(this.map, from, to))
        avatar.entity = { ...avatar.entity, position: to };
      else delete avatar.target;
    }
    this.tick += 1;
  }

  intent(
    playerId: string,
    intent: Intent,
  ): "UNSUPPORTED_INTENT" | "INVALID_TARGET" | null {
    const avatar = this.avatars.get(playerId);
    if (!avatar) return "INVALID_TARGET";
    if (intent.t === "move") {
      if (!isWalkable(this.map, intent)) return "INVALID_TARGET";
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
    };
  }
}
