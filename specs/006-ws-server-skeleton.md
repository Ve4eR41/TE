# 006 — WS-сервер и комната

## Цель и зависимости

После 005: Node HTTP /health и WS /ws, одна комната в процессе, welcome/ping/pong.
Прочитать AGENTS.md, conventions, architecture, protocol и config-schema.

## Разрешённые изменения и зависимости

packages/server/**, scripts корневого package.json, lockfile, README,
docs/architecture.md. Разрешены ws 8 (runtime) и @types/ws 8 (dev в server).

## Контракт

main.ts загружает конфиг один раз; startGameServer({config,host?,port?}) возвращает
httpServer, room и идемпотентный stop(). По умолчанию 127.0.0.1:3001; тесты port=0.
MatchRoom хранит одноразовый roomId и список подключённых playerId. ID выдаёт сервер.
При новом подключении welcome с match config; после переподключения новый playerId.
Нет аккаунтов, выбора команды, сохранения сессии или матчмейкинга.
Здоровье возвращается только GET /health; WS upgrade только /ws.
Валидный ping возвращает pong с тем же requestId. Intent возвращает UNSUPPORTED_INTENT.
Невалидный текст — INVALID_MESSAGE. Binary закрывает соединение кодом 1003.
Ограничения размера/частоты/буфера из shared. Rate limit закрывает 1008 после ошибки.
Слишком большой кадр ограничивает ws. Закрытие очищает комнату.
Shutdown прекращает соединения и освобождает порт. Ошибки старта пробрасываются.
CLI поддерживает HOST, PORT, GAME_CONFIG_DIR; валидировать PORT.

## Проверки и завершение

Интеграционные тесты с настоящим ws-клиентом на временном порту: health, welcome,
pong, ошибки JSON/intent, binary, payload, rate limit, disconnect/cleanup,
переподключение, ошибочный путь upgrade, stop дважды, занятый порт.
Общие typecheck/test/lint/build. README содержит команды запуска/остановки.
Не запускать игровой таймер, не определять победу, урон или экономику.
