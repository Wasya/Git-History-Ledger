# Commit Analysis Prompt Template (xAI Grok / OpenAI / Ollama)

This prompt is optimized for **API providers**: xAI (Grok), OpenAI (GPT), Ollama.

> **Why a different template?**
> Models like Grok and GPT handle structured instructions differently from Claude.
> When a prompt contains section headers mixed with directives, Grok treats them
> as "tasks to plan and explain" — and starts paraphrasing the instructions
> instead of analyzing the code. These models need a short, direct prompt
> with no decorative structure in the instruction part.

Paste the content into **Settings → Analysis prompt template**.

Supported variables: `{projectName}`, `{projectPath}`, `{gitOutput}`

---

```
You are a code analyst. Read the diff below and write a technical breakdown of changes in project {projectName}.

Your response must contain exactly three sections with these headings:
## What changed
## Type of changes
## Key files

Be brief and factual. Do not explain your process, do not restate the instructions — write the analysis directly.

{gitOutput}
```

---

## Section guide

| Section | What to write |
|---|---|
| **What changed** | Which modules, components, or architecture layers are affected (based on file paths) |
| **Type of changes** | Bug fix / new feature / refactoring / config / dependencies |
| **Key files** | 2–5 most significant files with a brief note on what specifically changed |

## Provider-specific tips

- **Grok**: works best with a short prompt. If you add instructions, avoid bullet lists
  in the instruction part — Grok treats them as topics to explain rather than directives to follow.
- **GPT-4o / GPT-4o-mini**: handles structure better than Grok but still prefers
  a short, direct prompt for technical analysis.
- **Ollama (local models)**: quality varies greatly by model. Qwen2.5 and Mistral
  handle technical code analysis better than Llama-based models.
