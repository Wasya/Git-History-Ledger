# Шаблон промпта для анализа коммитов (Claude Code CLI)

Этот промпт предназначен для провайдера **Claude Code (CLI)**.  
Он даёт Claude прямой доступ к репозиторию через bash-команды.

Вставь содержимое в **Settings → Analysis prompt template**.

Поддерживаемые переменные: `{projectName}`, `{projectPath}`, `{gitOutput}`

---

```
  1. Получить коммит
  1.1. Разреши выполнение bash-команд
  1.2. Перейти в папку проекта {projectPath}
  1.3. Сделать Git pull, найти новый коммит/ы
  1.4. Для анализа диапазона коммитов:
	git log --format="%H %ad %an : %s" --date=short
	# за период:
	git log --format="%H %ad %an : %s" --date=short --after="2026-02-28" --before="2026-04-01"

  ---
  2. Сопоставить с GitLed

  Проверить, какие записи уже есть и что в них заполнено:

  curl -s "http://localhost:3001/api/commits?project_id=1" | python -c "
  import sys, json
  data = json.load(sys.stdin)
  for c in sorted(data, key=lambda x: x['id']):
      has_desc = bool(c.get('description'))
      has_notes = bool(c.get('notes'))
      print(f'id={c[\"id\"]} {c[\"commit_date\"][:10]} hash={c[\"commit_hash\"]} desc={has_desc} notes={has_notes}')
  "

  commit_hash в GitLed имеет формат FROM..TO — запись охватывает все коммиты между FROM и TO.

  ---
  3. Получить diff коммита

  # Один коммит:
  git show HASH --stat    # краткая статистика
  git show HASH           # полный diff

  # Диапазон:
  git log --stat FROM..TO
  git diff FROM TO

  ---
  4. Написать анализ (в description)

  Формат description — всегда начинается с raw git stat в code block, затем ---, затем анализ:

  ```
  Updating FROM..TO
  Fast-forward
   path/to/file.py | N +++---
   N files changed, N insertions(+), N deletions(-)
  HASH - Author, YYYY-MM-DD : commit message
  ```

  ---

  ## Author — commit message

  **Файл:** `path/to/file` | +N, -N

  ### Что изменено
  ...

  ### Причина / контекст
  ...

  ### Поведение до/после (если баг)
  ...

  ### Затронутые тесты (если релевантно)
  ...

  ### Влияние на GUI (если релевантно)
  - Влияние на UX/UI
  - Как было → как стало
  - Где искать в интерфейсе

  Объём анализа зависит от сложности:
  - Тривиальный коммит (1–3 строки, очевидное): 3–5 bullet points
  - Средний (баг, UX-фикс): полные разделы "Что изменено" + "Причина"
  - Крупный (новая фича, рефакторинг, security): полный анализ со всеми разделами

  Если запись охватывает несколько коммитов — секция для каждого коммита отдельно или общий заголовок группы.
  Если используешь таблицу или mermaid-диаграмму — вставляй между тройными бэктиками.

  ---
  5. Написать notes (краткая суть)

  Поле notes — 1–3 предложения: что сделано, почему важно, на что влияет.
  Без форматирования. Если есть связь с другим коммитом в GitLed — указать id.

  ---
  6. Создать JSON и отправить PUT

  # Создать файл (в текущей директории):
  cat > ./upd_{id}.json << 'EOF'
  {
    "description": "...",
    "notes": "..."
  }
  EOF

  # Отправить:
  curl -s -X PUT http://localhost:3001/api/commits/{id} \
    -H "Content-Type: application/json" \
    -d @./upd_{id}.json

  # Проверить результат:
  curl -s http://localhost:3001/api/commits/{id} | python -c "import sys,json; c=json.load(sys.stdin); print('OK' if c.get('description') else 'EMPTY')"
```
