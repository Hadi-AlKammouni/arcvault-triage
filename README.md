# ArcVault AI Triage

> 🚧 **In progress** — Valsoft AI Engineer technical assessment, Feb 2026.

An AI-powered intake and triage pipeline for the synthetic B2B SaaS company **ArcVault**.
Unstructured inbound messages (email / web form / support portal) arrive at a webhook;
the workflow classifies them, extracts entities, decides a destination queue,
flags low-confidence or high-impact cases for human review, and writes a structured
JSON record per request.

## Stack

- **Orchestrator:** n8n (self-hosted via Docker Compose)
- **LLM:** Groq — `llama-3.3-70b-versatile` (free tier)
- **Output sinks:** local JSON file + Webhook.site (mock downstream)

## Layout

```
n8n/         exported workflow + screenshots
prompts/     LLM prompts (source of truth)
data/        sample inputs + structured outputs
docs/        architecture + prompt rationale write-ups
scripts/     helper scripts to fire sample inputs
```

## Status

Build in progress. Final deliverables (Loom walkthrough, exported workflow JSON,
prompts, architecture write-up) will land in this README before submission.
