import { randomUUID } from "node:crypto";
import {
  PROTOCOL_VERSION,
  type MatchConfig,
  type ServerMessage,
} from "@troll-vs-elves/shared";

export class MatchRoom {
  readonly id = randomUUID();
  private readonly playerIds = new Set<string>();

  constructor(readonly match: MatchConfig) {}

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
  }

  welcome(playerId: string): ServerMessage {
    return {
      v: PROTOCOL_VERSION,
      t: "welcome",
      playerId,
      roomId: this.id,
      match: this.match,
    };
  }
}
