# Commit Analysis Prompt Template (Claude CLI)

This prompt is intended for the **Claude Code (CLI)** provider.

> **Important:** Claude CLI runs in sandboxed mode — no bash tools available.
> The full diff is injected by the backend automatically. The prompt must only
> describe the **output format**; do not include git/curl/bash commands.

Paste the content (inside triple backticks) into **Settings → Analysis prompt template**.

Supported variables: `{projectName}`, `{projectPath}`, `{testsPath}`, `{gitOutput}`

> **Note:** `{testsPath}` is a string substitution for the tests folder path.
> The list of relevant test cases is appended to the prompt automatically by the
> backend (when **Tests folder** is configured in project settings). The `notes`
> field is also auto-filled — the backend appends its own instruction after your template.

---

```
You are a technical code change analyst. Below is the full diff for a commit in project "{projectName}". Write a ready-to-use analysis in Markdown format.

IMPORTANT: all the necessary code is already provided in the block below. Do NOT run git/bash/curl, do NOT request permissions, do NOT suggest commands to execute — just return the analysis text.

Format:

## {Author} — {commit message}

For each changed file:
**File:** `path/to/file` | +N, -N

### What changed
- summary of code changes

### Reason / context
- why this was done (based on the code and commit message)

### Before / after behavior   (only for bug fixes)
- how it was — how it is now

### What to check when testing   (if relevant)
- scenarios to cover based on the changes;
- test cases to verify; project automated tests are in {testsPath}

### GUI impact   (if relevant)
- what changes in UX/UI and where to find it in the interface

Analysis depth depends on complexity:
- Trivial commit (1–3 lines, obvious): 3–5 bullet points, no extra sections
- Medium (bug fix, UX tweak): "What changed" + "Reason" sections
- Large (new feature, refactor, security): all relevant sections

If the diff covers multiple commits — a separate section per commit.
Wrap tables and ASCII diagrams in ``` blocks.
Do not repeat the raw diff in the response.

Diff:
\`\`\`
{gitOutput}
\`\`\`
```

---

## Section guide

| Section | When to include |
|---|---|
| **What changed** | Always — summary of code changes |
| **Reason / context** | Always — why it was done |
| **Before / after behavior** | Bug fixes only |
| **What to check when testing** | When changes affect logic or behavior |
| **GUI impact** | When UI/UX components are modified |

## Analysis depth

| Commit | Scope |
|---|---|
| Trivial (1–3 lines, config, rename) | 3–5 bullet points |
| Medium (bug fix, UX tweak) | "What changed" + "Reason" sections |
| Large (new feature, refactor, security) | All relevant sections |
