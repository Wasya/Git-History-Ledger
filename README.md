# Git History Ledger

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)

A local web app that turns raw `git pull` output into a searchable, AI-annotated change journal.  
Paste or auto-pull from your repositories — get a structured, browsable history with Markdown notes and AI summaries.

![Main view](docs/main-view.png)

---

## Features

- **Import git pull output** — paste manually or trigger `git pull` directly from the UI
- **Tree view** — commits grouped by Year → Month → Week → Day
- **AI analysis** — automatic summaries via xAI, OpenAI, Anthropic, Claude Code CLI, or Ollama (local)
- **Chat with commits** — ask follow-up questions about any change
- **Markdown editor** — rich description and notes fields with live preview
- **Diff syntax highlighting** — colored `+`/`-` lines, file stats, commit ranges
- **Full-text search** — across hash, branch, description, and notes
- **Multilingual UI** — built-in Russian and English; load any custom `.json` language file
- **Dark / light theme** — persisted across sessions
- **Customizable code font** — system, Cascadia Code, JetBrains Mono, Fira Code, and more

---

## Screenshots

| Import | Add Project | Settings |
|--------|-------------|----------|
| ![Import modal](docs/import-modal.png) | ![Add project](docs/add-project.png) | ![Settings](docs/settings.png) |

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/Wasya/Git-History-Ledger.git
cd Git-History-Ledger

# 2. Install all dependencies
npm run install:all

# 3. Configure the backend (copy the example, edit if needed)
cp backend/config.example.json backend/config.json

# 4. Start backend + frontend
npm run dev
```

Open **http://localhost:5173** in your browser.  
The backend API runs at **http://localhost:3001**.

---

## Git Pull Input Format

The parser expects the output of a **wrapper script** that prepends a timestamp header to `git pull`:

```
=== Fri 03/20/2026 16:37:51.59 ============================
From 192.0.2.1:/srv/git/my-project
   2b980259..bd548394  master     -> origin/master
Updating 2b980259..bd548394
Fast-forward
 src/core/config.py | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

**Windows batch wrapper example:**

```bat
@echo off
echo === %date% %time% ============================
git -C "C:\projects\my-repo" pull
```

You can also trigger `git pull` directly from the sidebar (with or without AI analysis) — the wrapper header is added automatically.

---

## Automating Import from Build Scripts

Instead of pasting git pull output manually, you can **POST it directly to the API** from any build script. This lets you wire up GitLed as a passive observer of your CI/build pipeline — every pull is recorded automatically.

### How it works

```
POST http://localhost:3001/api/commits
Content-Type: application/json

{
  "project_id": 1,
  "raw_text": "=== Mon 04/28/2026 12:00:00 ============================\n<git pull output>"
}
```

The `raw_text` field must start with the `=== date ===` header so the parser can extract the timestamp. Find your `project_id` with:

```bash
curl http://localhost:3001/api/projects
```

### Ready-made scripts

Drop-in import scripts are provided in [`docs/scripts/`](docs/scripts/):

| Script | Platform |
|---|---|
| [`gitled-import.ps1`](docs/scripts/gitled-import.ps1) | Windows (PowerShell) |
| [`gitled-import.sh`](docs/scripts/gitled-import.sh) | Linux / macOS (bash + python3) |

Both scripts are silent when GitLed is not running — they won't break your build.

### Windows CMD + PowerShell example

```bat
@echo off
cd C:\projects\my-repo

git pull > git_pull.log 2>&1
findstr /i /c:"Already up to date." git_pull.log >nul
if "%ERRORLEVEL%"=="0" (
    del git_pull.log 2>nul
    exit /b
)

:: Import into GitLed (silently skipped if server is not running)
powershell -NoProfile -ExecutionPolicy Bypass ^
    -File "C:\path\to\gitled-import.ps1" ^
    -PullLog "git_pull.log" -ProjectId 1

:: ... your build commands here
```

### Linux / macOS bash example

```bash
#!/usr/bin/env bash
cd /srv/projects/my-repo

git pull > git_pull.log 2>&1
grep -qi "Already up to date." git_pull.log && { rm git_pull.log; exit 0; }

# Import into GitLed
bash /path/to/gitled-import.sh git_pull.log 1

# ... your build commands here
```

---

## AI Analysis

Configure an AI provider in **Settings → AI provider**:

| Provider | Requires |
|---|---|
| xAI (Grok) | API key |
| OpenAI | API key |
| Anthropic (Claude API) | API key |
| **Claude Code (CLI)** | Claude Code subscription — no key needed |
| Ollama (local) | Running Ollama instance |

AI generates a Markdown summary of each pull. You can also open a **chat** on any commit to ask follow-up questions. The prompt template is fully customizable in Settings.

---

## Prompt Templates

Ready-made analysis prompt templates for the **Claude Code (CLI)** provider are included in [`docs/prompts/`](docs/prompts/):

| File | Language |
|---|---|
| [`analysis-prompt-ru.md`](docs/prompts/analysis-prompt-ru.md) | Russian |
| [`analysis-prompt-en.md`](docs/prompts/analysis-prompt-en.md) | English |

Each template walks Claude through a full analysis workflow: fetch the commit diff, match it to an existing GitLed record, write a structured Markdown description, and send a `PUT` request to save it — all via bash commands.

Copy the content into **Settings → Analysis prompt template** to use it.

---

## Multilingual UI

The interface ships with **Russian** and **English** built in.  
To add another language:

1. Open Settings → **Download template** — downloads the current locale as `.json`
2. Translate the strings
3. Settings → **Load file...** — applies the new language instantly

The JSON format is simple and human-readable — no build step needed.

---

## Configuration

`backend/config.json` is created from `config.example.json` and stores your personal settings (AI provider, API key, custom prompt, font preferences). It is **gitignored** and never committed.

| Field | Description |
|---|---|
| `ai_provider` | `xai` / `openai` / `anthropic` / `claude_cli` / `ollama` |
| `ai_api_key` | API key (empty for Claude CLI and Ollama) |
| `ai_model` | Model name, e.g. `gpt-4o-mini` |
| `ai_base_url` | Custom base URL (required for Ollama, optional for others) |
| `ai_prompt_lang` | Default analysis language: `ru` or `en` |
| `ai_prompt_custom` | Custom prompt template (supports `{projectName}`, `{projectPath}`, `{gitOutput}`) |
| `font_mono` | Monospace font CSS value |
| `font_size` | Code font size in px |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, react-markdown |
| Backend | Node.js, Express, better-sqlite3 |
| Database | SQLite (`backend/ledger.db`, auto-created) |
| AI | Fetch-based calls to OpenAI-compatible APIs + Anthropic + Claude CLI |

---

## Database Schema

| Table | Fields |
|---|---|
| `projects` | `id`, `name`, `path`, `created_at` |
| `commits` | `id`, `project_id`, `commit_date`, `branch`, `commit_hash`, `raw_output`, `description`, `notes`, `created_at` |

`ON DELETE CASCADE` — deleting a project removes all its commits.

---

## REST API

Base URL: `http://localhost:3001`

```
GET    /api/projects
POST   /api/projects
DELETE /api/projects/:id

GET    /api/commits?project_id=&search=
POST   /api/commits
PUT    /api/commits/:id
DELETE /api/commits/:id
POST   /api/commits/:id/ask      ← AI chat

GET    /api/settings
PUT    /api/settings
POST   /api/settings/test        ← test AI connection
```

---

## License

[MIT](LICENSE) © 2026 Andrey Koshevarov

---

---

## На русском

**Git History Ledger** — локальное веб-приложение для ведения журнала изменений Git-репозиториев.

Импортирует вывод `git pull`, парсит его по сессиям, сохраняет в SQLite и отображает в виде дерева с поиском, Markdown-редактором и AI-анализом.

### Быстрый старт

```bash
git clone https://github.com/Wasya/Git-History-Ledger.git
cd Git-History-Ledger
npm run install:all
cp backend/config.example.json backend/config.json
npm run dev
```

Открыть **http://localhost:5173**.

### Основные возможности

- Импорт вывода `git pull` — вручную или прямо из интерфейса
- Дерево коммитов: Год → Месяц → Неделя → День
- AI-анализ изменений (xAI, OpenAI, Anthropic, Claude Code CLI, Ollama)
- Чат с коммитом — задавай уточняющие вопросы об изменениях
- Markdown-редактор описаний и заметок
- Подсветка синтаксиса diff
- Полнотекстовый поиск
- Мультиязычный интерфейс — RU/EN встроены, поддержка кастомных JSON-файлов локализации
- Тёмная и светлая тема
- Настройка шрифта кода

### Автоматический импорт из билд-скриптов

Вместо ручной вставки вывода `git pull` можно отправлять его напрямую в API из любого скрипта сборки:

```
POST http://localhost:3001/api/commits
Content-Type: application/json
{ "project_id": 1, "raw_text": "=== дата ===\n<вывод git pull>" }
```

Готовые скрипты — в папке [`docs/scripts/`](docs/scripts/):
- [`gitled-import.ps1`](docs/scripts/gitled-import.ps1) — Windows PowerShell
- [`gitled-import.sh`](docs/scripts/gitled-import.sh) — Linux / macOS

Если GitLed не запущен — скрипты молча пропускают импорт и не ломают сборку.

### Шаблоны промптов

Готовые шаблоны для провайдера **Claude Code (CLI)** находятся в [`docs/prompts/`](docs/prompts/):

- [`analysis-prompt-ru.md`](docs/prompts/analysis-prompt-ru.md) — русский
- [`analysis-prompt-en.md`](docs/prompts/analysis-prompt-en.md) — английский

Вставь содержимое в **Settings → Analysis prompt template**.

### AI-провайдеры

| Провайдер | Требует |
|---|---|
| xAI (Grok) | API ключ |
| OpenAI | API ключ |
| Anthropic (Claude API) | API ключ |
| **Claude Code (CLI)** | Подписка Claude Code — ключ не нужен |
| Ollama (локальный) | Запущенный Ollama |

### Лицензия

[MIT](LICENSE) © 2026 Andrey Koshevarov
