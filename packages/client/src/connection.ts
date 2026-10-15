import {
  decodeServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ErrorCode,
  type Intent,
  type Snapshot,
  type Team,
  type ServerMessage,
} from "@troll-vs-elves/shared";

const ACTION_ERRORS = (() =>
  ({
    INVALID_TARGET: "Здесь нельзя: занято, препятствие или место появления.",
    UNSUPPORTED_INTENT: "Это действие пока недоступно.",
    ACTION_FORBIDDEN: "Строить, улучшать и нанимать может только эльф.",
    INSUFFICIENT_RESOURCES: "Не хватает золота или дерева. Подождите дохода.",
    BUILD_LIMIT_REACHED: "Достигнут лимит построек.",
    MATCH_ENDED: "Время матча вышло. Действия остановлены.",
    INVALID_UNIT: "Такого стража нельзя нанять.",
    UNIT_LIMIT_REACHED: "Достигнут лимит стражей.",
    SPAWN_BLOCKED: "Нет места для стража. Отойдите на свободную землю.",
    INVALID_BUILDING: "Такой постройки нет.",
    NOT_OWNER: "Можно улучшать только свою стену.",
    MAX_LEVEL: "Стена уже улучшена до максимума.",
    OUT_OF_RANGE: "Слишком далеко. Подойдите ближе.",
  }) satisfies Partial<Record<ErrorCode, string>>)();
const getActionError = (code: ErrorCode): string | undefined =>
  code in ACTION_ERRORS
    ? ACTION_ERRORS[code as keyof typeof ACTION_ERRORS]
    : undefined;

const TIMING = (() => ({ pingIntervalMs: 2_000, timeoutMs: 8_000 }))();
export type ConnectionState =
  "connecting" | "connected" | "retrying" | "disconnected" | "error";
export interface ConnectionObserver {
  onState: (
    state: ConnectionState,
    detail?: string,
    retryable?: boolean,
  ) => void;
  onLatency: (milliseconds: number) => void;
  onSnapshot?: (snapshot: Snapshot) => void;
  onRejection?: (detail: string) => void;
  onWelcome: (message: Extract<ServerMessage, { t: "welcome" }>) => void;
}

export interface GameConnection {
  (): void;
  sendIntent: (intent: Intent) => boolean;
}

export const getWebSocketUrl = (pageUrl: string, team?: Team): string => {
  const url = new URL("/ws", pageUrl);
  if (team) url.searchParams.set("team", team);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
};

export const connectToServer = (
  url: string,
  observer: ConnectionObserver,
): GameConnection => {
  const socket = new WebSocket(url);
  let finished = false;
  let welcomed = false;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let pending: { requestId: string; started: number } | undefined;
  let sequence = 0;
  const clearTimers = (): void => {
    clearTimeout(timeoutId);
    clearInterval(intervalId);
    pending = undefined;
  };
  const finish = (
    state: "disconnected" | "error",
    detail?: string,
    retryable = false,
  ): void => {
    if (finished) return;
    finished = true;
    clearTimers();
    socket.close();
    if (retryable) observer.onState(state, detail, true);
    else observer.onState(state, detail);
  };
  const timeoutId = setTimeout(
    () => finish("error", "Сервер не ответил. Попробуйте ещё раз.", true),
    TIMING.timeoutMs,
  );
  const ping = (): void => {
    if (socket.readyState !== WebSocket.OPEN || finished) return;
    if (pending) {
      if (performance.now() - pending.started >= TIMING.timeoutMs)
        finish("error", "Связь с сервером потеряна.", true);
      return;
    }
    sequence += 1;
    const requestId = `ping-${sequence}`;
    pending = { requestId, started: performance.now() };
    const message: ClientMessage = {
      v: PROTOCOL_VERSION,
      t: "ping",
      requestId,
    };
    socket.send(JSON.stringify(message));
  };
  observer.onState("connecting");
  socket.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (finished) return;
    const message =
      typeof event.data === "string" ? decodeServerMessage(event.data) : null;
    if (!message) {
      finish("error", "Не удалось прочитать ответ сервера.");
      return;
    }
    if (message.t === "welcome" && !welcomed) {
      welcomed = true;
      clearTimeout(timeoutId);
      observer.onWelcome(message);
      observer.onState("connected");
      ping();
      intervalId = setInterval(ping, TIMING.pingIntervalMs);
    } else if (
      message.t === "pong" &&
      pending?.requestId === message.requestId
    ) {
      observer.onLatency(Math.round(performance.now() - pending.started));
      pending = undefined;
    } else if (message.t === "snapshot" && welcomed) {
      observer.onSnapshot?.(message);
    } else if (message.t === "error" && getActionError(message.code)) {
      observer.onRejection?.(
        getActionError(message.code) ?? "Действие отклонено.",
      );
    } else if (message.t === "error") {
      finish(
        "error",
        message.code === "RATE_LIMITED"
          ? "Слишком много запросов. Подключитесь снова."
          : message.code === "ROOM_FULL"
            ? "Лес заполнен. Попробуйте позже."
            : message.code === "ROLE_TAKEN"
              ? "Тролль уже в лесу. Выберите эльфа."
              : "Сервер отклонил запрос.",
      );
    }
  });
  socket.addEventListener("error", () =>
    finish("error", "Сервер недоступен. Попробуйте подключиться позже.", true),
  );
  socket.addEventListener("close", () =>
    finish("disconnected", "Соединение закрыто", true),
  );
  return Object.assign(() => finish("disconnected", "Вы вышли из леса"), {
    sendIntent: (intent: Intent): boolean => {
      if (finished || !welcomed || socket.readyState !== WebSocket.OPEN)
        return false;
      sequence += 1;
      const message: ClientMessage = {
        v: PROTOCOL_VERSION,
        t: "intent",
        requestId: `intent-${sequence}`,
        intent,
      };
      socket.send(JSON.stringify(message));
      return true;
    },
  });
};
