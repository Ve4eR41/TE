import {
  connectToServer,
  type ConnectionObserver,
  type GameConnection,
} from "./connection.js";

const RETRY = (() => ({
  initialMs: 2_000,
  maximumMs: 10_000,
  multiplier: 2,
}))();

export const connectWithRetry = (
  url: string,
  observer: ConnectionObserver,
): GameConnection => {
  let active: GameConnection | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let delayMs = RETRY.initialMs;
  let stopped = false;
  let recovering = false;
  const start = (): void => {
    retryTimer = undefined;
    active = connectToServer(url, {
      ...observer,
      onState: (state, detail, retryable) => {
        if (stopped) return;
        if (retryable) {
          recovering = true;
          const waitMs = delayMs;
          delayMs = Math.min(RETRY.maximumMs, delayMs * RETRY.multiplier);
          retryTimer = setTimeout(start, waitMs);
          observer.onState(
            "retrying",
            `Связь потеряна. Повтор через ${waitMs / 1_000} с. Новый вход сбросит героя, стены и ресурсы.`,
          );
        } else {
          if (state === "connected") {
            delayMs = RETRY.initialMs;
            if (recovering)
              detail =
                "Связь восстановлена. Вы вошли заново: ресурсы и стены сброшены.";
            recovering = false;
          }
          observer.onState(state, detail);
        }
      },
    });
  };
  start();
  return Object.assign(
    () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(retryTimer);
      active?.();
      observer.onState("disconnected", "Вы вышли из леса");
    },
    {
      sendIntent: (
        intent: Parameters<GameConnection["sendIntent"]>[0],
      ): boolean => !stopped && (active?.sendIntent(intent) ?? false),
    },
  );
};
