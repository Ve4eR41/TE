import "./styles.css";
import type { Snapshot } from "@troll-vs-elves/shared";
import {
  connectToServer,
  getWebSocketUrl,
  type GameConnection,
} from "./connection.js";
import { createForestScene, type ForestScene } from "./forest-scene.js";

const element = <T extends HTMLElement>(selector: string): T => {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing ${selector}`);
  return result;
};
const main = (): void => {
  const button = element<HTMLButtonElement>("#connect");
  const status = element("#status");
  const dot = element("#status-dot");
  const latency = element("#latency");
  const session = element("#session");
  const host = element("#scene");
  const sceneStatus = element("#scene-status");
  const timer = element("#match-timer");
  const phase = element("#match-phase");
  const role = element("#player-role");
  const players = element("#player-count");
  const position = element("#player-position");
  let connection: GameConnection | undefined;
  let scene: ForestScene | undefined;
  let generation = 0;
  let latest: Snapshot | undefined;
  let ownId = "";
  const clearScene = (): void => {
    generation += 1;
    scene?.destroy();
    scene = undefined;
    latest = undefined;
    host.dataset.connected = "false";
    sceneStatus.hidden = false;
    sceneStatus.textContent = "Нажмите «Войти в лес», чтобы начать";
    timer.textContent = "30:00";
    phase.textContent = "ОЖИДАНИЕ";
    role.textContent = "ВАШ ГЕРОЙ";
    players.textContent = "— игроков";
    position.textContent = "";
  };
  button.addEventListener("click", () => {
    if (connection) {
      connection();
      connection = undefined;
      return;
    }
    clearScene();
    const current = generation;
    connection = connectToServer(getWebSocketUrl(window.location.href), {
      onState: (state, detail) => {
        dot.dataset.state = state;
        status.textContent =
          detail ??
          (state === "connected"
            ? "Вы в лесу. Выберите, куда идти."
            : "Подключаемся к лесу…");
        button.textContent =
          state === "connecting"
            ? "Отменить подключение"
            : state === "connected"
              ? "Выйти из леса"
              : "Войти в лес ↗";
        if (state === "error" || state === "disconnected") {
          connection = undefined;
          clearScene();
          latency.textContent = "PING —";
          session.textContent =
            "Прогулка по лесу · бой и постройки появятся позже";
        }
      },
      onLatency: (milliseconds) => {
        latency.textContent = `PING ${milliseconds} мс`;
      },
      onRejection: (detail) => {
        status.textContent = detail;
      },
      onWelcome: (message) => {
        ownId = message.playerId;
        sceneStatus.textContent = "Пробуждаем лес…";
        void createForestScene(host, message.map, ownId, (intent) => {
          if (current === generation) connection?.sendIntent(intent);
        })
          .then((created) => {
            if (current !== generation) {
              created.destroy();
              return;
            }
            scene = created;
            if (latest) scene.update(latest);
            sceneStatus.hidden = true;
            host.dataset.connected = "true";
          })
          .catch(() => {
            if (current !== generation) return;
            connection?.();
            sceneStatus.textContent =
              "Не удалось отрисовать лес. Нужен браузер с поддержкой WebGL.";
          });
      },
      onSnapshot: (snapshot) => {
        latest = snapshot;
        scene?.update(snapshot);
        const seconds = Math.ceil(snapshot.timeLeftSeconds);
        timer.textContent = `${Math.floor(seconds / 60)
          .toString()
          .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
        phase.textContent =
          seconds === 0 ? "ПРОБА ЗАВЕРШЕНА" : `ФАЗА ${snapshot.phase} / 3`;
        const own = snapshot.entities.find(({ ownerId }) => ownerId === ownId);
        role.textContent = own?.team === "troll" ? "ВЫ — ТРОЛЛЬ" : "ВЫ — ЭЛЬФ";
        role.dataset.team = own?.team ?? "";
        players.textContent = `В ЛЕСУ: ${snapshot.entities.length}`;
        position.textContent = own
          ? `X ${Math.round(own.position.x)} · Y ${Math.round(own.position.y)}`
          : "";
        session.textContent =
          seconds === 0
            ? "Время вышло · выйдите из пустой комнаты и войдите для новой пробы"
            : "Клик / тап — идти · WASD / стрелки — движение · обходите деревья и пруд";
      },
    });
  });
  window.addEventListener(
    "pagehide",
    () => {
      connection?.();
      clearScene();
    },
    { once: true },
  );
  button.click();
};
main();
