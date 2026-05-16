# Prompts — Rationale

Two prompts ship with the workflow. Both live in [prompts/](../prompts/) as Markdown files — those are the source of truth. n8n Code nodes contain copies that get re-pasted whenever the .md changes. This doc explains the *why* behind each one and is paired with [docs/architecture.md](architecture.md).

---

## [classify_and_enrich.md](../prompts/classify_and_enrich.md)

**Why one combined call instead of two.** The PDF treats classification (step 2) and enrichment (step 3) as separate concepts but doesn't demand separate API calls. One Groq round-trip emits all six fields the routing code needs — `category`, `priority`, `confidence`, `core_issue`, `identifiers`, `urgency_signal` — for less than half the latency and token cost of two sequential calls. The schema is small enough that the model handles both jobs in one shot without quality loss, and there's no state to thread between an "extractor" and a "classifier" node.

**Why JSON mode + a strict schema.** We need a parseable, deterministic structure to feed the routing JS downstream. Groq's `response_format: json_object` forces syntactically valid JSON, and the schema block at the bottom of the prompt tells the model what shape the JSON must take. We pinned `temperature: 0` so the same input returns the same fields — important for a reviewer who runs the script twice expecting the same `results.json`.

**Why few-shot examples.** Three examples cover the boundaries the model is most likely to mishandle:

1. A single-user 500 error → `Bug Report` (not `Incident/Outage`). Added specifically because the smoke test — before the prompt was tightened — mislabeled Sample #1 (the 403 login error) as `Incident/Outage`. The prompt now has an explicit rule ("default for single-user reports is Bug Report") *and* a worked example, and the misclassification stopped.
2. A platform-wide outage → `Incident/Outage` with `priority: High`. Pairs with example 1 to draw the line between "broken for me" and "broken for everyone."
3. A SAML support question → `Technical Question` with a clean `integration` identifier. Pairs with the auth-keyword sub-route in the routing code.

**What I'd change with more time.**
- Move the examples to a separate few-shot bank and rotate based on the inbound message — pick the closest matches by embedding similarity instead of shipping a fixed three.
- Add a separate `disputed_amount` field for billing issues so the routing code doesn't have to infer the dispute via regex math. The current `max(amounts) − min(amounts)` heuristic works for our 5 samples but is fragile under wording variation (e.g. "we were billed $1240; the agreed rate is $980 plus a $50 surcharge" would inflate the dispute).
- Constrain the `identifiers.type` to a strict enum. The model occasionally invents types like `"request_type"` that the routing code silently ignores.

---

## [summarize.md](../prompts/summarize.md)

**Why a separate cheap call.** The summary is a 2–3 sentence string for the receiving team to read and act on. Combining it with the structured-output call would either bloat that prompt (more tokens, slower) or force the model to commit to phrasing before the routing has finalized. A separate call after routing means the summary can later be persona-tuned per destination (Engineering wants the error code; Billing wants the invoice number) without touching the classifier prompt. The cost is one extra round-trip per record — ~300 ms in practice.

**Why no JSON mode.** Plain text. JSON mode would only add overhead for a single-field output. We trim and store the string directly into `record.summary`.

**Why `temperature: 0.2`.** A small amount of variation makes the prose feel less robotic without making the content unpredictable. At `0.0` the wording is identical across runs, which sounds canned in a Loom demo. At `0.5+` we'd risk inventing details (the prompt explicitly forbids that).

**What I'd change with more time.**
- Persona-tune per destination queue: Engineering summaries lead with the error code and suspected component; Billing summaries lead with the invoice number and disputed amount; Product summaries lead with the customer's intent.
- Cap summary length with a hard `max_tokens` rather than relying on the model's interpretation of "2–3 sentences."
- A second-pass "redact PII" call before the summary lands in a downstream queue, gated on a config flag.

---

## What the AI got wrong that I had to fix

The assessment PDF §7 explicitly asks about this. Two stories worth telling.

**Story 1 — the classifier was wrong, and the prompt was the fix.** The pre-tightening prompt classified Sample #1 (a single-user 403 error: *"I tried logging in this morning and keep getting a 403 error … this started after your update last Tuesday"*) as `Incident/Outage` with 0.90 confidence. The model read "update" as a platform-wide change and inflated the scope. The fix was adding an explicit rule (*"single-user X stopped working for me reports are Bug Report, even if the message blames a recent deploy"*) plus a worked few-shot example. Not a prompt-engineering trick — clearer instructions and a concrete example for the boundary case.

**Story 2 — the classifier was right; the routing code was the bug.** Sample #3 (the $1,240 invoice vs $980 contract) classified cleanly: `Billing Issue`, 0.98 confidence, both amounts extracted as identifiers. But the routing code escalated it because my naive billing rule flagged *any* dollar value in the body as a "billing error > $500". The actual dispute was $260. The fix was in the JavaScript, not the prompt: when 2+ amounts are mentioned, compute the dispute as `max − min`; when one amount is mentioned, use it as the dispute. That kept Sample #3 in Billing where it belongs.

The reusable lesson: when something looks like "the AI is wrong", check whether the AI's output is correct and your deterministic interpretation of it is the actual bug. Routing rules deserve the same iterative testing loop that prompts do.
