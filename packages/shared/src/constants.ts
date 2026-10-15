export const PROTOCOL_VERSION = (() => 4 as const)();
export const MAX_MESSAGE_BYTES = (() => 64 * 1024)();
export const MAX_IDENTIFIER_LENGTH = (() => 64)();
export const MAX_SNAPSHOT_ENTITIES = (() => 128)();
export const MAX_MESSAGES_PER_WINDOW = (() => 30)();
export const MESSAGE_WINDOW_MS = (() => 1_000)();
export const MAX_BUFFERED_BYTES = (() => 256 * 1024)();
