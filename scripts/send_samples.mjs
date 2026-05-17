#!/usr/bin/env node
// POSTs each of the five sample inputs at the n8n triage webhook,
// captures the assembled records returned by `Respond to Webhook`,
// and writes:
//   data/outputs/results.json       — all 5 records, sorted by id
//   data/outputs/escalations.json   — the subset where escalation.flag === true
//
// Usage (from repo root):
//   node scripts/send_samples.mjs
//   WEBHOOK_URL=http://other.host:5678/webhook/triage node scripts/send_samples.mjs
//
// Prereq: the n8n workflow must be toggled to `Active` in the UI so the
// production URL responds. The default URL targets the local Docker n8n.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const WEBHOOK_URL     = process.env.WEBHOOK_URL ?? 'http://localhost:5678/webhook/triage';
const SAMPLES_PATH    = join(repoRoot, 'data', 'inputs', 'sample_inputs.json');
const RESULTS_PATH    = join(repoRoot, 'data', 'outputs', 'results.json');
const ESCALATIONS_PATH = join(repoRoot, 'data', 'outputs', 'escalations.json');

const samples = JSON.parse(readFileSync(SAMPLES_PATH, 'utf8'));
console.log(`Loaded ${samples.length} samples; POSTing to ${WEBHOOK_URL}\n`);

// POST one sample. n8n occasionally returns 200 with empty body when the
// workflow toggles state mid-call (Publish flips Active briefly), so we
// retry once after a short pause before giving up.
async function postSampleOnce(sample) {
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sample),
  });
  if (!response.ok) {
    return { kind: 'http_error', status: response.status, body: await response.text() };
  }
  const raw = await response.text();
  if (raw.length === 0) {
    return { kind: 'empty_body' };
  }
  try {
    return { kind: 'ok', record: JSON.parse(raw) };
  } catch {
    return { kind: 'bad_json', body: raw };
  }
}

async function postSample(sample) {
  let attempt = await postSampleOnce(sample);
  if (attempt.kind === 'empty_body') {
    await new Promise((r) => setTimeout(r, 750));
    attempt = await postSampleOnce(sample);
  }
  return attempt;
}

const results = [];
for (const sample of samples) {
  const start = Date.now();
  process.stdout.write(`  sample ${sample.id} (${sample.source.padEnd(14)})  ... `);

  let attempt;
  try {
    attempt = await postSample(sample);
  } catch (err) {
    console.error(`FETCH FAILED — ${err.message}`);
    console.error('Is n8n running and the workflow toggled Active?');
    process.exit(1);
  }

  if (attempt.kind === 'http_error') {
    console.error(`HTTP ${attempt.status} — ${attempt.body}`);
    process.exit(1);
  }
  if (attempt.kind === 'empty_body') {
    console.error('empty body after retry');
    console.error('The workflow is reachable but Respond to Webhook returned nothing.');
    console.error('In the n8n UI, confirm the workflow toggle (top right) reads `Active`,');
    console.error('then re-run. If it persists, check the Executions panel for an upstream error.');
    process.exit(1);
  }
  if (attempt.kind === 'bad_json') {
    console.error(`bad JSON in response: ${attempt.body.slice(0, 200)}`);
    process.exit(1);
  }

  const record = attempt.record;
  const ms = Date.now() - start;
  console.log(
    `${String(ms).padStart(5)} ms  ` +
    `category=${record.category.padEnd(18)}  ` +
    `dest=${record.routing.final_destination.padEnd(12)}  ` +
    `escalated=${record.escalation.flag}`
  );
  results.push(record);
}

results.sort((a, b) => a.id - b.id);
writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + '\n');
console.log(`\nWrote ${results.length} records to ${RESULTS_PATH}`);

const escalations = results.filter((r) => r.escalation.flag === true);
writeFileSync(ESCALATIONS_PATH, JSON.stringify(escalations, null, 2) + '\n');
console.log(`Wrote ${escalations.length} escalated records to ${ESCALATIONS_PATH}`);
