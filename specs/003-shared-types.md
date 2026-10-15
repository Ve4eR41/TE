# 003 — Базовые типы игрового состояния

## Цель и зависимости
После specs 001–002 определить небольшой общий словарь состояния без логики.
Перед кодом представить план. Один spec — один PR.

## Читать
`AGENTS.md`, `docs/conventions.md`, `docs/architecture.md`, `docs/protocol.md`.

## Разрешённые изменения
`packages/shared/src/types.ts`, его публичные exports, проверки типов/тесты
в shared и `docs/protocol.md` (раздел базовых типов). Новых зависимостей нет.
Конфиги и их типы из spec 002 не менять.

## Контракт
- `EntityId`, `PlayerId` — string aliases, без номинального branding в этом spec.
- `Team` — union `"troll" | "elves"`.
- `Resources` — readonly gold, wood, rage типа number.
- `Phase` — union `1 | 2 | 3`.
- `Position` — readonly x, y типа number, игровые единицы.
- `Entity` — readonly id: EntityId, ownerId: PlayerId | null, team: Team,
  position: Position, hp: number, maxHp: number.
- `Entity` — минимальное состояние принадлежащей команде сущности;
  нейтральные сущности, виды юнитов, скорости и боевые эффекты вводятся позже.
- Только именованные экспорты. Не добавлять runtime enum или дублирование
  конфигурационных Unit/Building и прочих схем spec 002.
- Добавить в protocol.md описание базовых типов и ссылку на исходник;
  явно сохранить статус «сетевой wire format ещё не определён».

## Проверки
Проверки типов включаются в `pnpm typecheck`: валидные примеры, недопустимая
команда, фаза 4, неполные Resources, попытка записи readonly поля.
Использовать `@ts-expect-error` на ожидаемых ошибках, чтобы изменение контракта
ломало проверку. Vitest runtime-тесты для стираемых типов не нужны.
Type fixtures не экспортировать как публичный API и не включать в dist.

## Не делать
Не добавлять Intent, Snapshot, EntityDelta, формулы, баланс, матч или транспорт.
Не считать TypeScript проверкой внешнего JSON: runtime-схемы протокола — spec 005.

## Definition of Done
`pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` проходят.
Публичный entry point shared экспортирует типы и остаётся безопасным для браузера.
Документация и статические проверки соответствуют контракту выше.
