// validate-ceremony.mjs — the planting ceremony's CI check (ADR-0006).
//
// A joining PR appends line(s) to plantings.jsonl. This validator enforces the
// mechanics a keeper shouldn't have to eyeball:
//   1. APPEND-ONLY: the head file must start with the base file's exact lines —
//      no edits, no reorders, no deletions of history. (Only trailing-newline
//      differences are tolerated: a final-newline touch-up is not a rewrite.)
//   2. The full log must still place: parse + placeGrove() (dupes, unknown
//      clearings, capacity) using this grove's grove.yml constants.
//   3. Each new `planted` line is well-formed: owner/repo id, an https URL that
//      lives under the tree's own GitHub owner, an ISO timestamp.
//   4. Each new line about a tree is authored by that tree's owner (--actor).
//      Org-owned trees can legitimately fail this one — the keeper may merge
//      over the red check after judging it (that's what keepers are for).
//
// Usage (CI): node tools/validate-ceremony.mjs --base /tmp/base.jsonl \
//               --head plantings.jsonl --actor "$GITHUB_ACTOR" [--config grove.yml]
// Exit 0 = ceremony valid.

import { parsePlantings, placeGrove } from './place.mjs';

const TREE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/;
const CLEARING_ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// grove.yml is deliberately flat — a full YAML parser would be overkill here
export function parseGroveYml(text) {
  const cfg = {};
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.+)$/);
    if (!m) continue;
    let v = m[2].trim().replace(/^["']|["']$/g, '');
    cfg[m[1]] = v !== '' && !isNaN(Number(v)) ? Number(v) : v;
  }
  return cfg;
}

function urlUnderOwner(url, owner) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const low = owner.toLowerCase();
  if (u.hostname === 'raw.githubusercontent.com') {
    return u.pathname.toLowerCase().startsWith(`/${low}/`);
  }
  if (u.hostname.toLowerCase() === `${low}.github.io`) return true;
  return false; // other hosts: keeper territory, not auto-approvable
}

export function validateCeremony({ baseText, headText, actor, config = {} }) {
  const errors = [];
  const base = String(baseText ?? '');
  const head = String(headText ?? '');

  // 1) append-only — history is never edited, reordered, or deleted; only a
  // trailing-newline difference is forgiven (editors fight over final newlines)
  const baseTrim = base.replace(/\n+$/, '');
  if (baseTrim && !(head === base || head.replace(/\n+$/, '') === baseTrim || head.startsWith(baseTrim + '\n'))) {
    errors.push('append-only violated: the existing planting log was modified — a ceremony may only ADD lines at the end');
  }

  // 2) the whole log must still parse and place
  let events = [];
  let newEvents = [];
  try {
    events = parsePlantings(head);
    newEvents = events.slice(parsePlantings(base).length);
    placeGrove(events, config);
  } catch (e) {
    errors.push(String(e.message || e));
  }

  // 3+4) per-new-line checks
  for (const ev of newEvents) {
    const tag = `"${ev.tree || ev.id || ev.kind}"`;
    if (ev.kind === 'planted') {
      if (!ev.tree || !TREE_ID.test(ev.tree)) errors.push(`${tag}: "tree" must be a GitHub owner/repo id`);
      if (!ev.url) errors.push(`${tag}: a planting needs the published tree.json "url"`);
      else if (ev.tree && TREE_ID.test(ev.tree) && !urlUnderOwner(ev.url, ev.tree.split('/')[0])) {
        errors.push(`${tag}: "url" must be https and live under the tree's own GitHub owner (raw.githubusercontent.com/<owner>/… or <owner>.github.io/…)`);
      }
      if (!ev.ts || isNaN(Date.parse(ev.ts))) errors.push(`${tag}: "ts" must be an ISO timestamp`);
    }
    if (ev.kind === 'clearing' && (!ev.id || !CLEARING_ID.test(ev.id))) {
      errors.push(`${tag}: clearing ids are lowercase slugs (a-z, 0-9, hyphens)`);
    }
    if (actor && ['planted', 'felled', 'transplanted', 'renamed'].includes(ev.kind) && ev.tree) {
      const owner = ev.tree.split('/')[0];
      if (owner.toLowerCase() !== String(actor).toLowerCase()) {
        errors.push(`${tag}: PR author "${actor}" does not own this tree — org-owned trees need the keeper's judgement`);
      }
    }
  }

  return { ok: errors.length === 0, errors, newEvents: newEvents.length };
}

// ---------------- CLI ----------------
import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name) => {
    const i = process.argv.indexOf('--' + name);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const read = (p, fallback) => { try { return readFileSync(p, 'utf8'); } catch { return fallback; } };
  const config = parseGroveYml(read(arg('config') || 'grove.yml', ''));
  const result = validateCeremony({
    baseText: read(arg('base'), ''),
    headText: read(arg('head') || 'plantings.jsonl', ''),
    actor: arg('actor') || '',
    config,
  });
  if (result.ok) {
    console.log(`🌱 ceremony valid — ${result.newEvents} new event(s), the grove still places cleanly`);
  } else {
    console.error('✗ the planting ceremony has problems:\n' + result.errors.map(e => '  - ' + e).join('\n'));
  }
  process.exit(result.ok ? 0 : 1);
}
