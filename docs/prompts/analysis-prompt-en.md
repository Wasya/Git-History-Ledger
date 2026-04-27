# Commit Analysis Prompt Template (Claude Code CLI)

This prompt is intended for the **Claude Code (CLI)** provider.  
It gives Claude direct access to the repository via bash commands.

Paste the content into **Settings → Analysis prompt template**.

Supported variables: `{projectName}`, `{projectPath}`, `{gitOutput}`

---

```
  1. Fetch the commit
  1.1. Allow bash command execution
  1.2. Navigate to the project folder {projectPath}
  1.3. Run git pull, find the new commit(s)
  1.4. To analyze a range of commits:
	git log --format="%H %ad %an : %s" --date=short
	# for a specific period:
	git log --format="%H %ad %an : %s" --date=short --after="2026-02-28" --before="2026-04-01"

  ---
  2. Match with GitLed

  Check which records already exist and what fields are filled:

  curl -s "http://localhost:3001/api/commits?project_id=1" | python -c "
  import sys, json
  data = json.load(sys.stdin)
  for c in sorted(data, key=lambda x: x['id']):
      has_desc = bool(c.get('description'))
      has_notes = bool(c.get('notes'))
      print(f'id={c[\"id\"]} {c[\"commit_date\"][:10]} hash={c[\"commit_hash\"]} desc={has_desc} notes={has_notes}')
  "

  commit_hash in GitLed has the format FROM..TO — the record covers all commits between FROM and TO.

  ---
  3. Get the commit diff

  # Single commit:
  git show HASH --stat    # brief statistics
  git show HASH           # full diff

  # Range:
  git log --stat FROM..TO
  git diff FROM TO

  ---
  4. Write the analysis (into description)

  The description format — always starts with a raw git stat in a code block, then ---, then the analysis:

  ```
  Updating FROM..TO
  Fast-forward
   path/to/file.py | N +++---
   N files changed, N insertions(+), N deletions(-)
  HASH - Author, YYYY-MM-DD : commit message
  ```

  ---

  ## Author — commit message

  **File:** `path/to/file` | +N, -N

  ### What changed
  ...

  ### Reason / context
  ...

  ### Before/after behavior (if a bug fix)
  ...

  ### Affected tests (if relevant)
  ...

  ### GUI impact (if relevant)
  - UX/UI impact
  - Before → after
  - Where to find in the interface

  Analysis depth depends on complexity:
  - Trivial commit (1–3 lines, obvious): 3–5 bullet points
  - Medium (bug, UX fix): full "What changed" + "Reason" sections
  - Large (new feature, refactor, security): full analysis with all sections

  If a record covers multiple commits — a separate section per commit or a shared group heading.
  If using a table or mermaid diagram — wrap it in triple backticks.

  ---
  5. Write notes (brief summary)

  The notes field — 1–3 sentences: what was done, why it matters, what it affects.
  No formatting. If there is a connection to another GitLed record — include its id.

  ---
  6. Build the JSON and send a PUT

  # Create the file (in the current directory):
  cat > ./upd_{id}.json << 'EOF'
  {
    "description": "...",
    "notes": "..."
  }
  EOF

  # Send:
  curl -s -X PUT http://localhost:3001/api/commits/{id} \
    -H "Content-Type: application/json" \
    -d @./upd_{id}.json

  # Verify the result:
  curl -s http://localhost:3001/api/commits/{id} | python -c "import sys,json; c=json.load(sys.stdin); print('OK' if c.get('description') else 'EMPTY')"
```
