# Troll vs Elves

Браузерная игра: один тролль против N эльфов, матч на 30 минут.
Текущий этап: выполнены specs 001–003 — инструменты монорепозитория,
загрузчик конфигов и базовые игровые типы.
Сервер и клиент пока содержат только точки входа; игра ещё не запускается.

## Подготовка

Нужны Node.js из `.node-version` (24 LTS) и pnpm из `packageManager` в package.json.
Если pnpm ещё нет, установите закреплённую версию: `npm install -g pnpm@11.28.6`.
Из корня репозитория:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

`pnpm format` исправляет форматирование. Typecheck сначала собирает shared;
build выполняет сборку пакетов в порядке зависимостей. В shared есть тесты загрузчика
и браузерной границы; server/client пока разрешают отсутствие тестов.
Пакеты: `@troll-vs-elves/shared`, `@troll-vs-elves/server`, `@troll-vs-elves/client`.
Для проверки отдельного пакета: `pnpm --filter @troll-vs-elves/shared test`.

## Порядок разработки

Прочитайте [AGENTS.md](AGENTS.md), [соглашения](docs/conventions.md) и назначенный spec.
Выполнены [001](specs/001-monorepo-setup.md),
[загрузчик конфигов (002)](specs/002-shared-config-loader.md) и
[базовые типы (003)](specs/003-shared-types.md). Следующий шаг — описать
контракт формул (004), затем протокол и WS-сервер. Каждый spec — отдельный PR.
Сначала краткий план, затем реализация и проверки.

## Документы

- [Замысел и открытые вопросы](docs/vision.md)
- [Границы модулей](docs/architecture.md)
- [Статус сетевого протокола](docs/protocol.md)
- [Контракт конфигурации](docs/config-schema.md)
- [Очередь разработки](specs/README.md)

`CLAUDE.md` — ссылка на AGENTS.md. `.cursor/rules/project.mdc` направляет Cursor
к тем же правилам. `config/` содержит параметры матча и пустые списки сущностей;
`tools/sim` появится по своему spec.

## Конфиги и shared API

Схемы и типы импортируются из `@troll-vs-elves/shared`. Серверный загрузчик
`loadConfig(rootDir)` и `ConfigError` доступны отдельно через
`@troll-vs-elves/shared/config/node`. rootDir указывает на каталог `config/`,
а не на корень репозитория. Браузерный entry point не использует Node I/O.
Загрузчик не кеширует данные: будущий сервер должен вызвать его один раз до матча.
Значения характеристик сущностей ещё не утверждены.
