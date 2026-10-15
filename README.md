# Troll vs Elves

Браузерная игра: один тролль против N эльфов, матч на 30 минут.
Текущий этап: инструменты TypeScript-монорепозитория (spec 001).
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
build выполняет сборку пакетов в порядке зависимостей. Тесты поведения появятся
в следующих specs; пока Vitest разрешает отсутствие тестов.
Пакеты: `@troll-vs-elves/shared`, `@troll-vs-elves/server`, `@troll-vs-elves/client`.
Для проверки отдельного пакета: `pnpm --filter @troll-vs-elves/shared test`.

## Порядок разработки

Прочитайте [AGENTS.md](AGENTS.md), [соглашения](docs/conventions.md) и назначенный spec.
После [001](specs/001-monorepo-setup.md) следующий шаг —
[загрузчик конфигов (002)](specs/002-shared-config-loader.md), затем
[базовые типы (003)](specs/003-shared-types.md). Каждый spec — отдельный PR.
Сначала краткий план, затем реализация и проверки.

## Документы

- [Замысел и открытые вопросы](docs/vision.md)
- [Границы модулей](docs/architecture.md)
- [Статус сетевого протокола](docs/protocol.md)
- [Контракт конфигурации](docs/config-schema.md)
- [Очередь разработки](specs/README.md)

`CLAUDE.md` — ссылка на AGENTS.md. `.cursor/rules/project.mdc` направляет Cursor
к тем же правилам. `config/` и `tools/sim` появятся по своим specs.
