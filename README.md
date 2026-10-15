# Troll vs Elves

Браузерная игра: один тролль против N эльфов, сессионные матчи по 30 минут.
Репозиторий содержит стартовые инструкции и спецификации. Код игры,
зависимости и команды сборки пока не созданы.

## С чего начать
1. Прочитать [AGENTS.md](AGENTS.md) и [соглашения](docs/conventions.md).
2. Выполнить [spec 001](specs/001-monorepo-setup.md): сначала план, затем код.
3. После проверки результата перейти к [002](specs/002-shared-config-loader.md),
   затем [003](specs/003-shared-types.md). Каждый spec — отдельный PR.

## Документы
- [Замысел и открытые вопросы](docs/vision.md)
- [Границы модулей](docs/architecture.md)
- [Статус сетевого протокола](docs/protocol.md)
- [Контракт конфигурации](docs/config-schema.md)
- [Очередь разработки и шаблон spec](specs/README.md)

`CLAUDE.md` — ссылка на AGENTS.md. `.cursor/rules/project.mdc` направляет Cursor
к тем же правилам. Папки packages/, config/ и tools/sim появятся по своим specs.
