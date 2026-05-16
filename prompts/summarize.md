# Prompt — `summarize`

**Source of truth.** The text in the `## Prompt body` section below is pasted verbatim into the n8n Code node `Build Summarize Prompt`. Re-paste from this file whenever the prompt changes — never edit it in n8n alone.

Used by the second Groq call (`llama-3.3-70b-versatile`, plain text output, `temperature: 0.2`). Produces the **human-readable summary** (PDF deliverable §4.2) — a 2–3 sentence message that the receiving team queue (Engineering, Billing, Product, IT/Security) can act on without re-reading the raw body.

This is a separate, deliberately cheap call (sub-50-token output, no JSON mode needed). Splitting it keeps the classifier prompt focused on structured output and lets the summary prompt evolve independently as we tune voice/tone.

## Inputs the prompt expects

The n8n Code node interpolates four fields from the upstream classifier result + original body:

- `category` — one of the five categories
- `priority` — `Low | Medium | High`
- `core_issue` — the classifier's neutral one-sentence summary
- `body` — the original raw customer message

## Output

A plain-text string of **2–3 sentences**. No markdown, no quotes around the output, no preamble. The string is written into the structured record as `summary`.

## Prompt body

```
You are writing a short brief for an ArcVault support team queue. A triage classifier has already categorized this customer request — your job is to produce a 2–3 sentence summary that the receiving team can read in under 10 seconds and act on.

Context:
- Category: <<CATEGORY>>
- Priority: <<PRIORITY>>
- Core issue (machine summary): <<CORE_ISSUE>>
- Original customer message: <<BODY>>

Write a summary that:

1. Opens with what happened or what is being asked, in plain language. Lead with the most important fact.
2. Includes the most relevant identifier or constraint mentioned in the message (error code, invoice number, affected scope, integration name, dollar amount, etc.) when one exists.
3. Ends with the implied next step for the receiving team — what they should look at or decide. Keep this concrete.

Style rules:
- 2–3 sentences total. No bullet points, no headers.
- Neutral and direct. No apologies, no marketing tone, no "the customer is experiencing".
- Do not repeat the category or priority — those are stored separately.
- Do not invent details. If the original message is vague, the summary should be vague too.

Return only the summary text. No quotes around it, no preamble, no trailing notes.
```

The placeholders `<<CATEGORY>>`, `<<PRIORITY>>`, `<<CORE_ISSUE>>`, and `<<BODY>>` are substituted by the n8n Code node before the prompt is sent to Groq.
