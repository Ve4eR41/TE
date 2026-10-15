import { randomUUID } from "node:crypto";
import {
  PROTOCOL_VERSION,
  type MatchConfig,
  type ForestMap,
  type ServerMessage,
  type Snapshot,
} from "@troll-vs-elves/shared";

export class MatchRoom {
  readonly id = randomUUID();
  private elapsedSeconds = 0;
  private tick = 0;
  private readonly playerIds = new Set<string>();

  constructor(
    readonly match: MatchConfig,
    readonly map: ForestMap,
  ) {}

  get size(): number {
    return this.playerIds.size;
  }

  join(): string {
    const playerId = randomUUID();
    this.playerIds.add(playerId);
    return playerId;
  }

  leave(playerId: string): void {
    this.playerIds.delete(playerId);
    if (!this.size) {
      this.elapsedSeconds = 0;
      this.tick = 0;
    }
  }

  advance(deltaSeconds: number): void {
    if (!this.size || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0)
      return;
    this.elapsedSeconds = Math.min(
      this.match.durationSeconds,
      this.elapsedSeconds + deltaSeconds,
    );
    this.tick += 1;
  }

  snapshot(): Extract<ServerMessage, { t: "snapshot" }> {
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
      entities: [],
      resources: { gold: 0, wood: 0, rage: 0 },
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
