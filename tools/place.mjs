// place.mjs — the grove's placement function (phase 6, ADR-0006/0007).
//
// Pure: (planting log, config) -> positions. No I/O, no clock, no Math.random —
// the only "randomness" is a seeded azimuth offset per clearing so two groves
// with the same members don't look like copies. Placement is APPEND-STABLE BY
// CONSTRUCTION: a tree's position depends only on lines above it in the log
// (its own slot number), so planting tree N+1 moves zero existing trees.
//
// placeVersion is semver and sacred (mirror of the generator's algoVersion):
// any change that moves any tree from the same log is a MAJOR bump, by ADR.

export const PLACE_VERSION = '1.0.0';

// The golden angle — phyllotaxis: seed k at (θ = k·GA, r = pitch·√k) packs like a
// sunflower head: near-optimal density, no collisions, and no seed ever moves.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const DEFAULTS = {
  // one plot per tree, identical for everyone ("equal soil", ADR-0007): ≈2.2× a
  // full-grown canopy radius (the mood sketch's ground disc is 14.5 units), so
  // neighboring crowns just interlace — a forest, not an orchard
  plotPitch: 32,
  // v1: every clearing reserves space for the same member count at creation
  // (reserved-space discipline — capacity classes are backlog G3, additive)
  clearingCapacity: 256,
  // firebreak between a clearing's reserved radius and its neighbor's, in plots
  firebreakPlots: 2,
};

// deterministic 32-bit string hash (FNV-1a) — seeds the per-clearing azimuth offset
function strHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// spiral slot k around a center, with a clearing-specific rotation
function spiral(k, pitch, azOffset) {
  const r = pitch * Math.sqrt(k);
  const a = k * GOLDEN_ANGLE + azOffset;
  return [r * Math.cos(a), r * Math.sin(a)];
}

// Parse a planting log (JSONL text). Returns events in file order — the file
// order IS the slot order (ADR-0006), so this must never sort or dedupe.
export function parsePlantings(text) {
  const events = [];
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    let ev;
    try { ev = JSON.parse(line); } catch (e) { throw new Error(`plantings line ${i + 1}: invalid JSON`); }
    if (!ev || typeof ev.kind !== 'string') throw new Error(`plantings line ${i + 1}: missing "kind"`);
    events.push(ev);
  }
  return events;
}

// Place a grove. events: parsed planting log (file order). config: grove.yml
// values (seed + the DEFAULTS above). Returns { placeVersion, config, clearings,
// trees } with positions in grove units on the ground plane [x, z].
export function placeGrove(events, config = {}) {
  const cfg = { seed: 'grove', ...DEFAULTS, ...config };
  const { plotPitch, clearingCapacity } = cfg;
  // a clearing's reserved radius: its outermost plot plus the firebreak
  const reservedRadius = plotPitch * (Math.sqrt(clearingCapacity) + cfg.firebreakPlots);
  // coarse pitch: 0.85 is a conservative floor for the golden-angle spiral's
  // nearest-neighbor gap, so 2·reserved/0.85 keeps reserved discs disjoint —
  // test-place.mjs measures the real gap at the 24-clearing bound (≈1.18× required)
  const coarsePitch = (2 * reservedRadius) / 0.85;

  const clearings = new Map(); // id -> { id, label, slot, center, azOffset, nextSlot, count }
  const declareClearing = (id, label) => {
    const slot = clearings.size; // commons takes slot 0 (the origin) before any event
    const center = spiral(slot, coarsePitch, strHash(cfg.seed + '|coarse') % 360 * (Math.PI / 180));
    clearings.set(id, {
      id, label: label || id, slot, center,
      azOffset: strHash(cfg.seed + '|' + id) % 360 * (Math.PI / 180),
      nextSlot: 0, count: 0,
    });
  };
  declareClearing('commons', 'Commons');

  const trees = new Map(); // tree id -> row (kept in first-planted order for output)
  const rows = [];
  const takeSlot = (clearing, lineNo) => {
    if (clearing.nextSlot >= clearingCapacity) {
      throw new Error(`plantings line ${lineNo}: clearing "${clearing.id}" is full (capacity ${clearingCapacity})`);
    }
    const k = clearing.nextSlot++;
    const [x, z] = spiral(k, plotPitch, clearing.azOffset);
    return { slot: k, pos: [clearing.center[0] + x, clearing.center[1] + z] };
  };

  events.forEach((ev, i) => {
    const lineNo = i + 1;
    switch (ev.kind) {
      case 'clearing': {
        if (!ev.id) throw new Error(`plantings line ${lineNo}: clearing without id`);
        if (clearings.has(ev.id)) throw new Error(`plantings line ${lineNo}: clearing "${ev.id}" already declared`);
        declareClearing(ev.id, ev.label);
        break;
      }
      case 'planted': {
        if (!ev.tree) throw new Error(`plantings line ${lineNo}: planted without tree`);
        const existing = trees.get(ev.tree);
        if (existing && existing.state === 'alive') throw new Error(`plantings line ${lineNo}: "${ev.tree}" is already planted`);
        const clearing = clearings.get(ev.clearing || 'commons');
        if (!clearing) throw new Error(`plantings line ${lineNo}: unknown clearing "${ev.clearing}" (declare it first)`);
        const { slot, pos } = takeSlot(clearing, lineNo);
        const row = {
          tree: ev.tree, url: ev.url || null, clearing: clearing.id,
          slot, pos, state: 'alive', plantedTs: ev.ts || null,
        };
        clearing.count++;
        trees.set(ev.tree, row);
        rows.push(row);
        break;
      }
      case 'transplanted': {
        const row = trees.get(ev.tree);
        if (!row || row.state !== 'alive') throw new Error(`plantings line ${lineNo}: cannot transplant "${ev.tree}" — not alive here`);
        const target = clearings.get(ev.to);
        if (!target) throw new Error(`plantings line ${lineNo}: unknown clearing "${ev.to}"`);
        // the old slot keeps a stump (slots are eternal, ADR-0007) …
        rows.push({ tree: ev.tree, url: null, clearing: row.clearing, slot: row.slot, pos: row.pos, state: 'stump', plantedTs: row.plantedTs });
        clearings.get(row.clearing).count--;
        // … and the tree takes the target clearing's next slot
        const { slot, pos } = takeSlot(target, lineNo);
        row.clearing = target.id; row.slot = slot; row.pos = pos;
        target.count++;
        break;
      }
      case 'felled': {
        const row = trees.get(ev.tree);
        if (!row || row.state !== 'alive') throw new Error(`plantings line ${lineNo}: cannot fell "${ev.tree}" — not alive here`);
        row.state = 'stump'; row.url = null; // the map stops pointing anywhere
        clearings.get(row.clearing).count--;
        break;
      }
      case 'renamed': {
        const row = trees.get(ev.tree);
        if (!row) throw new Error(`plantings line ${lineNo}: cannot rename "${ev.tree}" — unknown`);
        if (typeof ev.to !== 'string' || !ev.to) throw new Error(`plantings line ${lineNo}: rename of "${ev.tree}" without a target id`);
        if (trees.has(ev.to)) throw new Error(`plantings line ${lineNo}: cannot rename "${ev.tree}" to "${ev.to}" — id already exists here`);
        trees.delete(ev.tree);
        row.tree = ev.to; if (ev.url) row.url = ev.url;
        trees.set(ev.to, row);
        break;
      }
      case 'reserved': {
        // tombstone (ADR-0006 §erasure): consumes a slot invisibly so that every
        // later tree stands exactly where it stood before the original line vanished
        const clearing = clearings.get(ev.clearing || 'commons');
        if (!clearing) throw new Error(`plantings line ${lineNo}: unknown clearing "${ev.clearing}"`);
        takeSlot(clearing, lineNo);
        break;
      }
      default:
        break; // unknown kinds are ignored — forward compatibility (ADR-0006)
    }
  });

  return {
    placeVersion: PLACE_VERSION,
    config: { seed: cfg.seed, plotPitch, clearingCapacity, reservedRadius, coarsePitch },
    clearings: [...clearings.values()].map(c => ({
      id: c.id, label: c.label, slot: c.slot,
      center: c.center, reservedRadius, plots: c.nextSlot, alive: c.count,
    })),
    trees: rows,
  };
}
