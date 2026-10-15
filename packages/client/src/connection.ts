import {
  decodeServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from "@troll-vs-elves/shared";

const TIMING = (() => ({ pingIntervalMs: 2_000, timeoutMs: 8_000 }))();
export type ConnectionState =
  "connecting" | "connected" | "disconnected" | "error";
export interface ConnectionObserver {
  onState: (state: ConnectionState, detail?: string) => void;
  onLatency: (milliseconds: number) => void;
  onWelcome: (message: Extract<ServerMessage, { t: "welcome" }>) => void;
}

export const getWebSocketUrl = (pageUrl: string): string => {
  const url = new URL("/ws", pageUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
};

export const connectToServer = (
  url: string,
  observer: ConnectionObserver,
): (() => void) => {
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
  const finish = (state: "disconnected" | "error", detail?: string): void => {
    if (finished) return;
    finished = true;
    clearTimers();
    socket.close();
    observer.onState(state, detail);
  };
  const timeoutId = setTimeout(
    () => finish("error", "Сервер не ответил. Попробуйте ещё раз."),
    TIMING.timeoutMs,
  );
  const ping = (): void => {
    if (socket.readyState !== WebSocket.OPEN || finished) return;
    if (pending) {
      if (performance.now() - pending.started >= TIMING.timeoutMs)
        finish("error", "Связь с сервером потеряна.");
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
    } else if (message.t === "error") {
      finish(
        "error",
        message.code === "RATE_LIMITED"
          ? "Слишком много запросов. Подключитесь снова."
          : "Сервер отклонил запрос.",
      );
    }
  });
  socket.addEventListener("error", () =>
    finish("error", "Сервер недоступен. Попробуйте подключиться позже."),
  );
  socket.addEventListener("close", () =>
    finish("disconnected", "Соединение закрыто"),
  );
  return () => finish("disconnected", "Вы отключились от сервера");
};
