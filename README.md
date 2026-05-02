# Orynvae

**Orynvae** - локальное AI-пространство для авторов, которые хотят превращать сырые идеи в цельные новеллы, миры и сюжетные вселенные.

Приложение работает на машине пользователя и подключается к выбранному AI-провайдеру: LMStudio, Ollama, OpenAI, OpenRouter или любому OpenAI-compatible endpoint. Основной фокус - приватная работа с локальными моделями, без обязательного облачного backend.

## Ключевая идея

Orynvae должен начинаться не с пустой формы, а с диалога. Пользователь описывает, какую историю хочет создать, а AI помогает определить настройки проекта: жанр, тон, сеттинг, конфликт, формат, возможные направления развития и стартовую структуру.

## Основные возможности MVP

- AI Project Setup: создание проекта из свободного описания истории.
- Model Providers: настройки LMStudio, Ollama, OpenAI, OpenRouter и Custom OpenAI-compatible.
- Idea Lab: развитие первоначальной задумки.
- World Bible: лор, правила мира, локации и фракции.
- Characters: персонажи, мотивации, конфликты и связи.
- Plot Board: сюжетные арки, главы и поворотные точки.
- Chapter Editor: написание глав с AI-помощью.
- Canon: подтвержденные факты и проверка связности.

## Локальный запуск

- Backend: `http://localhost:9001`
- Frontend: `http://localhost:9002`
- Frontend проксирует API-запросы с `/api` на backend.

### Разработка

Требования для первого этапа:

- Python 3.11+
- `uv`
- Node.js
- `pnpm`

Если Codex/PowerShell-сессия не видит глобальные инструменты, подключите локальный bootstrap:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
. .\scripts\tool-env.ps1
uv --version
pnpm --version
```

`scripts\dev.ps1` делает это автоматически. Если локальная политика PowerShell блокирует `.ps1`, запускайте Windows-обертку:

```powershell
.\scripts\dev.cmd
```

Первичная установка:

```powershell
cd backend
uv sync --extra dev
uv run db-init

cd ..\frontend
pnpm install
```

Запуск backend и frontend одной командой:

```powershell
.\scripts\dev.ps1
```

Отдельные команды:

```powershell
cd backend
uv run dev

cd ..\frontend
pnpm dev
```

## Live Mode

В будущем Orynvae включает опциональный **Live Mode**: интерактивный режим, где пользователь может взять на себя роль одного или нескольких персонажей, выбирать действия и реплики, а AI превращает эти решения в художественный текст и сохраняет последствия для следующих глав.

## Документация

- [Концепт приложения](docs/concept.md)
- [Этапы реализации MVP](docs/mvp.md)
- [Техническая спецификация](docs/technical-spec.md)
- [Общий план MVP](plans/mvp-implementation-plan.md)
- [Задачи этапа 1](plans/stage-1-tasks.md)
