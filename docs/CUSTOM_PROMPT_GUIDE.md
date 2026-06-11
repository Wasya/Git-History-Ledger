# Руководство по кастомному промпту анализа · Custom Analysis Prompt Guide

> 🇷🇺 [Русская версия](#-русская-версия) · 🇬🇧 [English version](#-english-version)

---

## 🇷🇺 Русская версия

Поле **Settings → Analysis prompt template** задаёт, **как** AI оформляет разбор коммита.
Это **спецификация формата**, а не список действий. От того, что в нём написано,
напрямую зависит, получите вы аккуратный отчёт или «кашу» с запросами разрешений.

### Как работает анализ под капотом

Важно понимать, кто что делает. Когда вы импортируете коммит с галкой **«Run AI analysis»**
или жмёте **Ask AI**, происходит следующее:

| Шаг | Делает |
|---|---|
| Найти коммит, выполнить `git diff` / `git show`, достать полный diff | **бэкенд GitLed** |
| Подмешать релевантные автотесты (если задан путь к тестам) | **бэкенд GitLed** |
| Передать всё это модели одним промптом | **бэкенд GitLed** |
| **Написать текст анализа** | **AI-модель** |
| Записать `description` и `notes` в базу, показать в UI | **бэкенд GitLed** |

Вывод: **модели остаётся ровно один шаг — написать анализ.** Всю работу с гитом,
файлами, API и базой бэкенд уже сделал. Поэтому в промпте не должно быть инструкций
«сходи, забери, запиши» — модель запущена в изоляции (без инструментов) и выполнить их
не может. Если попросить — она начнёт просить разрешения или пересказывать инструкции
вместо анализа.

### Доступные переменные

В шаблон можно вставить плейсхолдеры — бэкенд подставит значения:

| Переменная      | Чем заменяется                                                               |
| --------------- | ---------------------------------------------------------------------------- |
| `{projectName}` | Имя проекта в GitLed                                                         |
| `{projectPath}` | Локальный путь к репозиторию (для справки в тексте)                          |
| `{testsPath}`   | Путь к папке с тестами проекта (пусто, если не задан)                        |
| `{gitOutput}`   | Заголовок коммита + полный diff (до 12 000 символов). **Главная переменная** |

> ⚠️ `{testsPath}` подставляет **строку пути** — это для упоминания в тексте, не для
> чтения. Сам список релевантных тестов бэкенд подмешивает **автоматически** (см.
> «Папка с тестами» ниже), модель к файлам не обращается.

Бэкенд **сам** добавляет к вашему промпту (вам писать это не нужно):
- блок с релевантными автотестами, если у проекта задана папка тестов;
- инструкцию сформировать короткое `notes` в конце ответа.

### Пример: как обыграть каждую переменную

Промпт, где задействованы все четыре плейсхолдера:

~~~
Ты — технический аналитик проекта «{projectName}» (репозиторий: {projectPath}).
Ниже приведён заголовок коммита и полный diff. Напиши разбор в Markdown.

## Что изменилось
- модули и файлы (по путям из diff)

## Зачем
- причина изменения по коду и сообщению коммита

## Что проверить
- сценарии для проверки; автотесты проекта лежат в {testsPath}

Отвечай на русском, кратко. Не выполняй команд — весь код уже ниже.

{gitOutput}
~~~

Что подставит бэкенд при анализе:

| В промпте       | Превратится в (пример)                                |
| --------------- | ----------------------------------------------------- |
| `{projectName}` | `Inventory`                                           |
| `{projectPath}` | `C:\Projects\MyBestProject`                           |
| `{testsPath}`   | `C:\Projects\Tests\MyBestProject`                     |
| `{gitOutput}`   | `70c54bd8 ... : fix: ...` + полный `git diff` коммита |

И **дополнительно** (автоматически, без вашего участия) — блок «Существующие автотесты,
возможно затронутые…» со списком конкретных тест-кейсов и инструкция про `notes`.

### Правила

**✅ Делайте:**
- Описывайте **структуру** разбора: какие разделы и в каком порядке.
- Задавайте тон, язык, объём («кратко», «по пунктам», «на русском/английском/барбадосском», ).
- Указывайте, на чём сфокусироваться (баги, влияние на UI, риски, тесты).
- Обязательно используйте `{gitOutput}` — без него модель не увидит изменения.

**❌ Не делайте:**
- Не пишите «разреши bash», «сделай git pull», «перейди в папку».
- Не просите `curl`, обращений к API, чтения файлов, записи JSON, `PUT`-запросов.
- Не просите «загляни в папку X» — модель не имеет доступа к файловой системе.
  (Для тестов есть отдельное поле — см. ниже.)

### ✅ Хороший пример (формат-only)

~~~
Ты — технический аналитик изменений кода. Ниже приведён полный diff коммита
проекта "{projectName}". Напиши готовый разбор в формате Markdown.

ВАЖНО: весь нужный код уже в блоке ниже. НЕ выполняй git/bash/curl,
НЕ запрашивай разрешений — просто верни текст анализа.

Формат:

## {Автор} — {сообщение коммита}

Для каждого изменённого файла:
**Файл:** `путь/к/файлу` | +N, -N

### Что изменено
- суть изменений по коду

### Причина / контекст
- зачем это сделано

### Поведение до / после   (только если это баг-фикс)

### Что проверить при тестировании   (если релевантно)

### Влияние на GUI   (если релевантно)

Глубина зависит от сложности:
- Тривиальный коммит (1–3 строки): 3–5 пунктов, без лишних разделов
- Средний (баг, UX-фикс): «Что изменено» + «Причина»
- Крупный (фича, рефакторинг, security): все релевантные разделы

Не повторяй сырой diff. Отвечай на русском.

Diff:
```
{gitOutput}
```
~~~

### ❌ Антипример (агентский — так НЕ надо)

~~~
1. Получить коммит
1.1. Разреши выполнение bash-команд          ← модель не может, и не должна
1.2. Перейти в папку проекта {projectPath}    ← это уже сделал бэкенд
1.3. Сделать Git pull, найти новый коммит      ← это уже сделал бэкенд
2. curl -s "http://localhost:3001/api/..."     ← обращение к API недопустимо
3. git show HASH                               ← diff уже в {gitOutput}
6. cat > upd.json ... curl -X PUT ...          ← запись в базу делает бэкенд
7. Сходи в папку C:\Tests и сравни             ← нет доступа; есть поле тестов
~~~

**Почему плохо:** каждая такая строка — команда агенту. В изолированном запуске
модель не может их выполнить и вместо анализа выдаёт «Разреши доступ…» / «Выполни
вручную…» / пересказ шагов. Именно это поведение выглядит как «анализ не про код».
Всё, что здесь перечислено (пункты 1, 2, 3, 6) — уже делает бэкенд GitLed; пункт 7 —
это поле «Папка с тестами».

### Подсказки по провайдерам

- **Claude (CLI и API):** запускается без инструментов и без доступа к репозиторию —
  агентские инструкции просто не сработают. Нужен формат-only промпт.
- **xAI Grok / OpenAI GPT:** любят **короткий** прямой промпт. Маркированные списки
  в части инструкций могут восприниматься как «задачи к разбору» — держите инструкции
  плотными, а структуру разделов — в конце.
- **Ollama (локальные):** качество сильно зависит от модели; Qwen2.5 / Mistral обычно
  лучше Llama для технического анализа.

### Поле notes заполняется автоматически

Короткое summary (`notes`, 1–3 предложения) бэкенд просит модель сформировать сам,
в конце ответа. **Вам не нужно** описывать формат notes в промпте. Если у коммита
уже есть ручные заметки — они не перезаписываются.

---

## Поле «Папка с тестами» (`tests_path`)

Необязательное свойство проекта (**кнопка-карандаш** рядом с проектом в боковой панели,
либо при создании проекта). Если оно задано, бэкенд при анализе коммита:

1. вытаскивает ключевые слова из diff (имена изменённых файлов, строковые литералы,
   идентификаторы);
2. сканирует папку на наличие тестов и ранжирует их по релевантности;
3. подмешивает в промпт список релевантных тест-кейсов;
4. в результате модель ссылается на **реальные** тесты в разделе «Что проверить» и
   подсказывает пробелы в покрытии.

**Свойства:**
- **Opt-in.** Пусто → фича выключена, поведение как обычно.
- **Безопасно.** К папке обращается только бэкенд (как и к самому репозиторию).
  AI-модель доступа к файловой системе не получает — ей передаётся уже готовый текст.
- **Недоступный путь → тихо пропускается**, ошибки не будет.

**Ограничение:** сейчас поддерживается **Robot Framework** (`.robot`-файлы). Тесты
других фреймворков пока не индексируются.

**Пример:** для проекта по пути `C:\Projects\MyBestProject` тесты лежат в
`C:\Projects\Tests\MyBestProject` — этот путь и указывается в поле.

---

## EN English version

The **Settings → Analysis prompt template** field controls **how** the AI formats a
commit analysis. It is a **format specification, not a task list**. What you put here
decides whether you get a clean report or garbage with permission prompts.

### How analysis works under the hood

| Step | Who does it |
|---|---|
| Find commit, run `git diff` / `git show`, get the full diff | **GitLed backend** |
| Inject relevant automated tests (if a tests folder is set) | **GitLed backend** |
| Send everything to the model as one prompt | **GitLed backend** |
| **Write the analysis text** | **AI model** |
| Save `description` + `notes`, render in the UI | **GitLed backend** |

The model's only job is to **write the analysis**. All git/file/API/DB work is already
done by the backend. So the prompt must not contain "go fetch / run / write" steps — the
model runs sandboxed (no tools) and cannot execute them. If asked, it will request
permissions or restate the instructions instead of analyzing.

### Available variables

| Variable | Replaced with |
|---|---|
| `{projectName}` | Project name in GitLed |
| `{projectPath}` | Local repo path (for reference in text) |
| `{testsPath}` | Path to the project's tests folder (empty if unset) |
| `{gitOutput}` | Commit header + full diff (up to 12,000 chars). **The key one** |

> ⚠️ `{testsPath}` substitutes the **path string** — for mentioning in text, not for
> reading. The actual list of relevant tests is injected by the backend **automatically**
> (see "Tests folder" below); the model never touches the files.

The backend **automatically** appends to your prompt (you don't write this):
- a block of relevant automated tests, if the project has a tests folder set;
- an instruction to produce a short `notes` summary at the end.

### Example: using every variable

A prompt that exercises all four placeholders:

~~~
You are a code analyst for project "{projectName}" (repo: {projectPath}).
Below is the commit header and full diff. Write an analysis in Markdown.

## What changed
- modules and files (from the diff paths)

## Why
- the reason, from the code and commit message

## What to test
- scenarios to verify; the project's automated tests live in {testsPath}

Be concise. Do not run commands — all code is already below.

{gitOutput}
~~~

What the backend substitutes at analysis time:

| In the prompt   | Becomes (example)                                        |
| --------------- | -------------------------------------------------------- |
| `{projectName}` | `Inventory`                                              |
| `{projectPath}` | `C:\Projects\MyBestProject`                              |
| `{testsPath}`   | `C:\Projects\Tests\MyBestProject`                        |
| `{gitOutput}`   | `70c54bd8 ... : fix: ...` + the commit's full `git diff` |

And **additionally** (automatically) — an "Existing automated tests possibly affected…"
block listing concrete test cases, plus the `notes` instruction.

### Rules

**✅ Do:**
- Describe the **structure** of the analysis: which sections, in what order.
- Set tone, language, length ("concise", "bullet points").
- Say what to focus on (bugs, UI impact, risks, tests).
- Always use `{gitOutput}` — without it the model sees no changes.

**❌ Don't:**
- Don't write "allow bash", "do a git pull", "cd into the folder".
- Don't ask for `curl`, API calls, reading files, writing JSON, `PUT` requests.
- Don't ask it to "look into folder X" — the model has no filesystem access.
  (Tests have a dedicated field — see below.)

### ✅ Good example (format-only)

~~~
You are a code-change analyst. Below is the full diff of a commit in project
"{projectName}". Write a finished analysis in Markdown.

IMPORTANT: all needed code is already in the block below. Do NOT run git/bash/curl,
do NOT request permissions — just return the analysis text.

Format:

## {Author} — {commit message}

For each changed file:
**File:** `path/to/file` | +N, -N

### What changed
### Why / context
### Before / after   (only for bug fixes)
### What to test   (if relevant)
### GUI impact   (if relevant)

Depth depends on complexity:
- Trivial (1–3 lines): 3–5 bullets, no extra sections
- Medium (bug, UX fix): "What changed" + "Why"
- Large (feature, refactor, security): all relevant sections

Don't repeat the raw diff.

Diff:
```
{gitOutput}
```
~~~

### ❌ Anti-example (agentic — do NOT do this)

~~~
1. Get the commit
1.1. Allow bash execution                  ← model can't, and shouldn't
1.2. cd into {projectPath}                  ← backend already did this
1.3. git pull, find new commits             ← backend already did this
2. curl -s "http://localhost:3001/api/..."  ← API calls not allowed
3. git show HASH                            ← diff is already in {gitOutput}
6. cat > upd.json ... curl -X PUT ...        ← backend writes to the DB
7. Go to C:\Tests and compare                ← no access; use the tests field
~~~

**Why it's bad:** every line is a command to an agent. Sandboxed, the model can't run
them and emits "Allow access…" / "Run this manually…" / a restatement of the steps
instead of analysis — the "not about the code" behavior. Everything listed (steps 1, 2,
3, 6) is already done by the backend; step 7 is the Tests folder field.

### Provider tips

- **Claude (CLI & API):** runs with no tools and no repo access — agentic instructions
  simply won't work. Use a format-only prompt.
- **xAI Grok / OpenAI GPT:** prefer a **short**, direct prompt. Bulleted instructions can
  be mistaken for "tasks to plan" — keep instructions tight, section structure at the end.
- **Ollama (local):** quality varies by model; Qwen2.5 / Mistral usually beat Llama for
  technical analysis.

### Notes are filled automatically

The short `notes` summary (1–3 sentences) is requested by the backend at the end of the
response. You **don't** need to describe the notes format in your prompt. Existing manual
notes are never overwritten.

### Tests folder field (`tests_path`)

An optional project property (**pencil button** next to a project in the sidebar, or when
creating a project). When set, the backend during analysis:

1. extracts keywords from the diff (changed file names, string literals, identifiers);
2. scans the folder for tests and ranks them by relevance;
3. injects the list of relevant test cases into the prompt;
4. so the model references **real** tests in the "what to test" section and points out
   coverage gaps.

- **Opt-in.** Empty → feature off, behavior as usual.
- **Safe.** Only the backend reads the folder (same as the repo itself). The AI model gets
  no filesystem access — only ready-made text.
- **Unreadable path → silently skipped**, no error.

**Limitation:** currently supports **Robot Framework** (`.robot` files). Other frameworks
are not indexed yet.
