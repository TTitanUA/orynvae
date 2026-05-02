# Orynvae: задачи этапа 1

Этап 1 закрывает локальный каркас приложения: backend, frontend, SQLite-хранилище, dev-скрипты и базовую проверку запуска.

## Задачи

- [x] Создать ветку `codex/mvp-stage-1`.
- [x] Добавить `backend/` на FastAPI.
- [x] Добавить healthcheck API: `GET /api/health`.
- [x] Добавить локальную структуру `data/`.
- [x] Добавить SQLite migration runner.
- [x] Добавить начальную миграцию с базовыми MVP-таблицами.
- [x] Добавить `frontend/` на Vite + React + TypeScript.
- [x] Добавить proxy `/api` на `http://127.0.0.1:9001`.
- [x] Добавить первый рабочий экран с индикатором состояния backend/database.
- [x] Добавить `scripts/dev.mjs`, `scripts/dev.ps1`, `scripts/dev.sh`.
- [x] Добавить базовые backend-тесты.
- [x] Добавить базовый frontend-тест.
- [x] Установить зависимости.
- [x] Запустить backend-тесты.
- [x] Запустить frontend-тесты и build.
- [x] Запустить локальный dev-стенд через `scripts/dev.ps1`.
- [x] Проверить frontend вручную в Chrome DevTools.

## Граница этапа

Этап считается завершенным, когда локальный запуск открывает Orynvae в браузере, frontend получает успешный ответ от `/api/health`, а SQLite-база создается через `db-init`.
