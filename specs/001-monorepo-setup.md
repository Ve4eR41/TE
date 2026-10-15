# 001 — Инструменты монорепозитория

## Цель
Подготовить воспроизводимый TypeScript workspace. Игровую логику не реализовывать.
Перед кодом представить краткий план. Один spec — один PR.

## Читать
`AGENTS.md`, `docs/conventions.md`, `docs/architecture.md`.
Зависимостей от других specs нет. Существующие документы сохранить.

## Разрешённые изменения
Корневые package.json, pnpm-workspace.yaml, pnpm-lock.yaml, tsconfig,
ESLint/Prettier/Vitest-конфигурация, .gitignore, .node-version, .npmrc,
`.github/workflows/ci.yml`, README.md; package.json, tsconfig, src и конфигурация
сборки в packages/shared, packages/server, packages/client.
Правки существующих инструкций — только для приведения команд в соответствие.

## Версии и разрешённые зависимости
Node.js 24 LTS, pnpm 11 (точный patch зафиксировать в packageManager).
Разрешены: TypeScript 5, Vitest 3, ESLint 9, @eslint/js 9,
typescript-eslint 8, globals, Prettier 3, @types/node 24.
Выбрать совместимые patch-версии и сохранить lockfile; остальные пакеты требуют
изменения spec. Zod, ws, PixiJS и Vite появятся в своих задачах.

## Результат
- Три приватных ESM-пакета с именами из architecture; server/client объявляют
  зависимость `@troll-vs-elves/shared: workspace:*`.
- Shared собирается в dist с JS и декларациями. Зависимые пакеты используют
  публичные exports. Каждый пакет содержит минимальный src/index.ts
  (`export {};` допустим); пока без HTTP/WS и HTML.
- strict во всех пакетах, корректные ESM import paths, target ES2022.
  Node-типы доступны server, shared может проверять будущий Node entry point;
  client использует DOM и не получает Node-глобалы.
- Корневые команды: `typecheck`, `test`, `lint`, `build`, `format`.
  В каждом пакете доступны `typecheck`, `test`, `lint`, `build`;
  `pnpm --filter @troll-vs-elves/shared test` запускает только тесты shared.
  Build/typecheck сначала подготавливают shared, затем зависимые пакеты,
  и работают с чистого checkout без оставшегося dist.
- `test` запускает Vitest однократно; пока тестов нет, допускается явный
  passWithNoTests. Не добавлять фиктивную игровую функцию ради теста.
- `lint` проверяет ESLint и `prettier --check` по репозиторию. Flat config,
  no-explicit-any, запрет default export и корректные исключения для dist.
  IIFE проверяется при просмотре diff; отдельный ESLint-плагин не нужен.
- README: подготовка Node/pnpm, install, команды, текущий этап и следующий spec.
- CI на push/PR: checkout, настройка закреплённого pnpm и Node 24,
  `pnpm install --frozen-lockfile`, typecheck, test, lint, build.
- .gitignore исключает node_modules, dist, coverage, локальные секреты,
  но не конфиги-примеры и не lockfile.

## Не делать
Не реализовывать конфиг-лоадер, протокол, сервер, рендер, симулятор или деплой.
Не добавлять другие task runners и зависимости, не менять игровой баланс.

## Definition of Done
С чистыми артефактами проходят `pnpm install --frozen-lockfile`,
`pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`.
В отчёте отметить, что тестов поведения пока нет; тестовый runner лишь настроен.
Проверить зависимости пакетов, отсутствие Node API в client и именованные exports.
