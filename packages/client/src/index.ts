import "./styles.css";
import type { ForestMap } from "@troll-vs-elves/shared";
import { connectToServer, getWebSocketUrl } from "./connection.js";
import { createForestScene } from "./forest-scene.js";

const main = (): void => {
  const button = document.querySelector<HTMLButtonElement>("#connect");
  const status = document.querySelector<HTMLElement>("#status");
  const dot = document.querySelector<HTMLElement>("#status-dot");
  const latency = document.querySelector<HTMLElement>("#latency");
  const session = document.querySelector<HTMLElement>("#session");
  const scene = document.querySelector<HTMLElement>("#scene");
  const sceneStatus = document.querySelector<HTMLElement>("#scene-status");
  if (
    !button ||
    !status ||
    !dot ||
    !latency ||
    !session ||
    !scene ||
    !sceneStatus
  )
    throw new Error("Missing application elements");
  let disconnect: (() => void) | undefined;
  let disposeScene: (() => void) | undefined;
  let disposed = false;
  button.addEventListener("click", () => {
    if (disconnect) {
      disconnect();
      disconnect = undefined;
      return;
    }
    disconnect = connectToServer(getWebSocketUrl(window.location.href), {
      onState: (state, detail) => {
        dot.dataset.state = state;
        status.textContent =
          detail ??
          (state === "connected"
            ? "Связь с сервером установлена"
            : "Подключаемся к лесу…");
        button.textContent =
          state === "connecting"
            ? "Отменить подключение"
            : state === "connected"
              ? "Отключиться от сервера"
              : "Подключиться к серверу ↗";
        if (state === "error" || state === "disconnected") {
          disconnect = undefined;
          latency.textContent = "PING —";
          session.textContent =
            "Сетевой прототип · бой и движение в разработке";
        }
      },
      onLatency: (milliseconds) => {
        latency.textContent = `PING ${milliseconds} мс`;
      },
      onWelcome: (message) => {
        if (!disposeScene) showScene(message.map);
        session.textContent = `Комната подключена · матч ${Math.round(message.match.durationSeconds / 60)} мин`;
      },
    });
  });
  const showScene = (map: ForestMap): void => {
    void createForestScene(scene, map)
      .then((cleanup) => {
        if (disposed) cleanup();
        else {
          disposeScene = cleanup;
          sceneStatus.hidden = true;
        }
      })
      .catch(() => {
        sceneStatus.textContent =
          "Не удалось отрисовать лес. Попробуйте браузер с поддержкой WebGL.";
      });
  };
  sceneStatus.textContent = "Нажмите «Подключиться», чтобы войти в лес";
  window.addEventListener(
    "pagehide",
    () => {
      disposed = true;
      disconnect?.();
      disposeScene?.();
    },
    { once: true },
  );
};

main();
