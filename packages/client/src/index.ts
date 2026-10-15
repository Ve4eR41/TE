import "./styles.css";
import type { Snapshot, Team, BuildingConfig } from "@troll-vs-elves/shared";
import { getWebSocketUrl, type GameConnection } from "./connection.js";
import { connectWithRetry } from "./reconnecting-connection.js";
import { createForestScene, type ForestScene } from "./forest-scene.js";

const element = <T extends HTMLElement>(selector: string): T => {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing ${selector}`);
  return result;
};
const main = (): void => {
  const button = element<HTMLButtonElement>("#connect");
  const roleChoice = element<HTMLSelectElement>("#role-choice");
  const gold = element("#resource-gold");
  const wood = element("#resource-wood");
  const rage = element("#resource-rage");
  const buildButton = element<HTMLButtonElement>("#build-wall");
  const upgradeButton = element<HTMLButtonElement>("#upgrade-wall");
  const buildingInfo = element("#building-info");
  const actionStatus = element("#action-status");
  const buildingCount = element("#building-count");
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
  let definitions: readonly BuildingConfig[] = [];
  let selectedId: string | null = null;
  let buildMode = false;
  const renderActions = (): void => {
    const own = latest?.entities.find(({ ownerId }) => ownerId === ownId);
    const wall = definitions.find(({ id }) => id === "wall");
    const available = Boolean(
      scene && latest && latest.timeLeftSeconds > 0 && own?.team === "elves",
    );
    buildButton.disabled = !available || !wall;
    buildButton.textContent = buildMode
      ? "Отменить · Esc"
      : wall
        ? `Стена · ${wall.cost.gold} ◆ ${wall.cost.wood} ♣`
        : "Стена";
    buildButton.setAttribute("aria-pressed", String(buildMode));
    const selected = latest?.buildings.find(({ id }) => id === selectedId);
    const definition = definitions.find(
      ({ id }) => id === selected?.buildingId,
    );
    upgradeButton.disabled =
      !available ||
      selected?.ownerId !== ownId ||
      selected?.level !== 1 ||
      !definition?.upgrade;
    upgradeButton.textContent = definition?.upgrade
      ? `Улучшить · ${definition.upgrade.cost.gold} ◆ ${definition.upgrade.cost.wood} ♣`
      : "Улучшить";
    buildingInfo.textContent = selected
      ? `Стена ${selected.level} ур. · HP ${selected.hp}/${selected.maxHp}${selected.ownerId === ownId ? " · ваша" : " · союзника"}`
      : "Нажмите на стену, чтобы выбрать её";
    buildingCount.textContent = `Стены: ${latest?.buildings.filter(({ ownerId }) => ownerId === ownId).length ?? 0} / ${wall?.maxPerPlayer ?? "—"}`;
    if (!available && buildMode) scene?.setBuildMode(null);
  };
  const clearScene = (): void => {
    generation += 1;
    scene?.destroy();
    scene = undefined;
    latest = undefined;
    definitions = [];
    selectedId = null;
    buildMode = false;
    renderActions();
    actionStatus.textContent = "Выберите эльфа, чтобы строить стены.";
    host.dataset.connected = "false";
    sceneStatus.hidden = false;
    sceneStatus.textContent = "Нажмите «Войти в лес», чтобы начать";
    timer.textContent = "30:00";
    phase.textContent = "ОЖИДАНИЕ";
    role.textContent = "ВАШ ГЕРОЙ";
    players.textContent = "— игроков";
    position.textContent = "";
    gold.textContent = "—";
    wood.textContent = "—";
    rage.textContent = "—";
  };
  button.addEventListener("click", () => {
    if (connection) {
      connection();
      connection = undefined;
      return;
    }
    clearScene();
    connection = connectWithRetry(
      getWebSocketUrl(
        window.location.href,
        roleChoice.value === "auto" ? undefined : (roleChoice.value as Team),
      ),
      {
        onState: (state, detail) => {
          dot.dataset.state = state;
          status.textContent =
            detail ??
            (state === "connected"
              ? "Вы в лесу. Выберите, куда идти."
              : "Подключаемся к лесу…");
          button.textContent =
            state === "connecting" || state === "retrying"
              ? "Отменить подключение"
              : state === "connected"
                ? "Выйти из леса"
                : "Войти в лес ↗";
          if (
            state === "retrying" ||
            state === "error" ||
            state === "disconnected"
          ) {
            if (state !== "retrying") connection = undefined;
            clearScene();
            sceneStatus.textContent =
              detail ?? "Нажмите «Войти в лес», чтобы начать";
            latency.textContent = "PING —";
            session.textContent =
              "Лесная крепость · строительство готово, бой — следующий этап";
          }
        },
        onLatency: (milliseconds) => {
          latency.textContent = `PING ${milliseconds} мс`;
        },
        onRejection: (detail) => {
          status.textContent = detail;
          actionStatus.textContent = detail;
        },
        onWelcome: (message) => {
          const current = generation;
          ownId = message.playerId;
          definitions = message.buildingDefinitions;
          sceneStatus.textContent = "Пробуждаем лес…";
          void createForestScene(
            host,
            message.map,
            ownId,
            (intent) => {
              if (current === generation) connection?.sendIntent(intent);
            },
            {
              onSelect: (id) => {
                selectedId = id;
                renderActions();
              },
              onBuildModeChange: (enabled) => {
                buildMode = enabled;
                renderActions();
                actionStatus.textContent = enabled
                  ? "Кликните по свободной земле рядом с героем. Esc — отмена."
                  : "Клик / тап — движение. Нажмите на стену для улучшения.";
              },
            },
          )
            .then((created) => {
              if (current !== generation) {
                created.destroy();
                return;
              }
              scene = created;
              if (latest) scene.update(latest);
              renderActions();
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
          gold.textContent = Math.floor(snapshot.resources.gold).toString();
          wood.textContent = Math.floor(snapshot.resources.wood).toString();
          rage.textContent = Math.floor(snapshot.resources.rage).toString();
          const previous = latest;
          const ownCount = snapshot.buildings.filter(
            ({ ownerId }) => ownerId === ownId,
          ).length;
          if (
            previous &&
            ownCount >
              previous.buildings.filter(({ ownerId }) => ownerId === ownId)
                .length
          )
            actionStatus.textContent = "Стена построена.";
          if (
            previous?.buildings.find(({ id }) => id === selectedId)?.level ===
              1 &&
            snapshot.buildings.find(({ id }) => id === selectedId)?.level === 2
          )
            actionStatus.textContent = "Стена улучшена до 2 уровня.";
          if (
            !previous &&
            snapshot.entities.find(({ ownerId }) => ownerId === ownId)?.team ===
              "elves"
          )
            actionStatus.textContent =
              "Нажмите «Стена», затем выберите место рядом с героем.";
          latest = snapshot;
          scene?.update(snapshot);
          renderActions();
          const seconds = Math.ceil(snapshot.timeLeftSeconds);
          timer.textContent = `${Math.floor(seconds / 60)
            .toString()
            .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
          phase.textContent =
            seconds === 0 ? "ПРОБА ЗАВЕРШЕНА" : `ФАЗА ${snapshot.phase} / 3`;
          const own = snapshot.entities.find(
            ({ ownerId }) => ownerId === ownId,
          );
          role.textContent =
            own?.team === "troll" ? "ВЫ — ТРОЛЛЬ" : "ВЫ — ЭЛЬФ";
          role.dataset.team = own?.team ?? "";
          players.textContent = `В ЛЕСУ: ${snapshot.entities.length}`;
          position.textContent = own
            ? `X ${Math.round(own.position.x)} · Y ${Math.round(own.position.y)}`
            : "";
          session.textContent =
            seconds === 0
              ? "Время вышло · выйдите из пустой комнаты и войдите для новой пробы"
              : "Клик / тап — идти · WASD / стрелки · эльф: «Стена», затем место на карте";
        },
      },
    );
  });
  buildButton.addEventListener("click", () => {
    const wall = definitions.find(({ id }) => id === "wall");
    if (wall && scene) scene.setBuildMode(buildMode ? null : wall);
  });
  upgradeButton.addEventListener("click", () => {
    if (selectedId)
      connection?.sendIntent({ t: "upgrade", entityId: selectedId });
  });
  roleChoice.addEventListener("change", () => {
    connection?.();
    button.click();
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
