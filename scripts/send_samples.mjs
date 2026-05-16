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

const results = [];
for (const sample of samples) {
  const start = Date.now();
  process.stdout.write(`  sample ${sample.id} (${sample.source.padEnd(14)})  ... `);

  let response;
  try {
    response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sample),
    });
  } catch (err) {
    console.error(`FETCH FAILED — ${err.message}`);
    console.error('Is n8n running and the workflow toggled Active?');
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`HTTP ${response.status} — ${await response.text()}`);
    process.exit(1);
  }

  const record = await response.json();
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
