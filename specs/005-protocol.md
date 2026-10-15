# 005 — Сетевой протокол v1

## Цель и зависимости

После 001–003 определить валидируемый wire format. Формулы 004 не нужны для
контрактов транспорта и откладываются до согласования игровых правил.
Перед реализацией прочитать AGENTS.md, conventions, architecture, protocol.

## Разрешённые изменения

shared/src/protocol.ts, protocol.test.ts, constants.ts, публичные экспорты shared,
docs/protocol.md. Новых зависимостей нет, использовать Zod 4.

## Контракт

JSON-объекты с v=1 и дискриминатором t. ClientMessage: ping с requestId или intent
с requestId и вложенным Intent. Intent: move, build, hire, upgrade, ability, buy,
subclass с полями из исходного плана. Идентификаторы непустые, trimmed, <=64 символов.
ServerMessage: welcome (playerId, roomId, match), pong (requestId), error
(code, необязательный requestId), snapshot (tick, entities, resources, phase,
timeLeftSeconds). Snapshot — полный список разрешённых получателю сущностей;
исчезновение означает удаление. Ресурсы относятся только к получателю.
Пока server не отправляет snapshots и не исполняет игровые интенты.

Все объекты strict. Координаты конечные, расстояния в игровых единицах.
HP неотрицателен и <= положительного maxHp; ресурсы неотрицательны.
Фазы 1/2/3; tick — неотрицательный safe integer. Не добавлять правила карты/баланса.
Схемы — источник типов Intent, Snapshot, ClientMessage, ServerMessage.
Декодеры принимают строку, возвращают сообщение или null без выбрасывания ошибок.
Технические пределы: сообщение 64 KiB UTF-8, ID 64 символа, snapshot 128 сущностей,
30 входящих сообщений за окно 1 s, буфер отправки 256 KiB. Константы через IIFE.

## Проверки и завершение

Проверить все варианты интентов и сообщений, malformed JSON, неправильную версию,
лишние поля, диапазоны/NaN/Infinity, пустые ID и переполнение лимитов UTF-8.
Сохранить браузерную границу. pnpm typecheck/test/lint/build проходят.
Не реализовывать игровую механику, авторизацию или транспорт в shared.
