# Commit Analysis Prompt Template (xAI Grok / OpenAI / Ollama)

This prompt is optimized for **API providers**: xAI (Grok), OpenAI (GPT), Ollama.

> **Why a different template?**
> Models like Grok and GPT treat long structured instructions as "tasks to plan
> and explain" — they start paraphrasing the instructions instead of analyzing
> the code. These models need a short, direct prompt with minimal decoration.

Paste the content (inside triple backticks) into **Settings → Analysis prompt template**.

Supported variables: `{projectName}`, `{projectPath}`, `{testsPath}`, `{gitOutput}`

> **Note:** `{testsPath}` is a string substitution for the tests folder path.
> The list of relevant test cases is appended to the prompt automatically by the backend.
> The `notes` field is also auto-filled.

---

```
You are a code analyst. Read the diff below and write a technical breakdown of changes in project {projectName}.

Do not run commands, do not request permissions — return only the analysis text.

Your response must contain sections:
## {Author} — {commit message}
**File:** `path/to/file` | +N, -N
### What changed
### Reason / context
### What to check when testing   (if relevant; tests: {testsPath})
### GUI impact   (if relevant)

Depth: trivial commit — 3–5 bullet points; medium — main sections; large — all sections.
Do not repeat the raw diff in the response.

{gitOutput}
```

---

## Provider-specific tips

- **Grok**: works best with a short prompt. Avoid bullet lists in the instruction
  part — Grok treats them as topics to explain rather than directives to follow.
- **GPT-4o / GPT-4o-mini**: handles structure better than Grok but still prefers
  a short, direct prompt for technical analysis.
- **Ollama (local models)**: quality varies greatly by model. Qwen2.5 and Mistral
  handle technical code analysis better than Llama-based models.
