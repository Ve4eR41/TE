# 025 — Локальный запуск через Docker Compose

## Цель

По запросу пользователя собрать существующий прототип для запуска одной командой.
Это ограниченная часть deploy: Docker, без публикации/CI/CD/хостинга.
Читать README, architecture и conventions.

## Контракт

- `docker compose up --build -d`, вход http://localhost:8080/.
- Multi-stage Dockerfile: Node24/pnpm11 со frozen lockfile для сборки; серверный
  runtime с production-зависимостями и JSON-конфигами; отдельный nginx web runtime
  с собранным клиентом. Не запускать Vite и установку зависимостей при старте.
  Production-упаковка использует shared lockfile и проходит без сети.
- Web проксирует /ws (включая query/Upgrade) и /health на server:3001.
  Наружу только порт web8080; порт хоста настраивается через GAME_PORT.
- Healthcheck обоих сервисов, ожидание здорового backend, restart unless-stopped,
  корректная остановка. nginx повторно разрешает адрес server после пересоздания.
- Процессы приложения работают от непривилегированных пользователей.
- .dockerignore исключает git, node_modules/dist, .env/секреты и локальные артефакты.
  Нет bind mounts исходников; матч в памяти и сбрасывается при рестарте.
- README: запуск/готовность/логи/остановка/обновление/смена порта. CI/CD остаётся
  будущей задачей. Зависимости приложения не добавлять.

## DoD

Compose config, реальная сборка образов и запуск, HTTP health/ассеты, WebSocket
welcome/snapshot/intent через web, две вкладки и строительство. Проверить рестарт
server, восстановление web proxy после пересоздания, остановку/повторный запуск.
Записать фактические проверки и ограничения sandbox. pnpm typecheck/test/lint/build.
