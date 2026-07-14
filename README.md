# 🌲🌲 My AI learning journey — the first grove

This repo is a **grove**: a place where people plant their
[AI learning trees](https://github.com/webmemo-code/ai-learning-tree) side by
side — a team, a community, a cohort. Every member is one tree; you walk between
them, see whose video bough is tall, and go ask them how they did it.

It is also **the first real grove** — planted 2026-07-14 from the
[grove template](https://github.com/webmemo-code/ai-learning-tree/tree/main/grove/template),
with [@webmemo-code](https://github.com/webmemo-code)'s own tree in the commons
at slot 0, and @webmemo-code as keeper. Want to stand here too? The ceremony is
below — the commons has room for 255 more.

The grove holds **no tree data** — only public pointers to each member's
published `tree.json`. Your evidence stays in your repo; this is a map, not a
warehouse. How placement works (and why nobody's tree ever moves):
[docs/05-grove.md](https://github.com/webmemo-code/ai-learning-tree/blob/main/docs/05-grove.md),
ADR-0006/0007.

## 🌱 Join — the planting ceremony

1. Grow a tree: set up your own tree repo (see the
   [main project](https://github.com/webmemo-code/ai-learning-tree)) and make
   sure your `data/tree.json` is published (raw GitHub URL or GitHub Pages).
2. Open a PR that appends **one line** to [`plantings.jsonl`](plantings.jsonl):

   ```json
   {"kind":"planted","tree":"you/your-tree","url":"https://raw.githubusercontent.com/you/your-tree/main/data/tree.json","clearing":"commons","ts":"2026-01-01T12:00:00Z"}
   ```

   Append at the end. Never edit or reorder existing lines — the file order is
   the seating order of the whole grove, and CI will refuse any rewrite.
3. CI runs the ceremony check (append-only, well-formed, your tree is yours,
   the grove still places). The keeper merges. **You are planted** — your spot
   on the spiral is yours for as long as the grove stands.

Want your team to stand together? Ask the keeper for a **clearing**
(`{"kind":"clearing","id":"your-team","label":"Your team"}`), then plant with
`"clearing":"your-team"`.

## 🍂 Leave, move, rename

- **Leave**: PR a `{"kind":"felled","tree":"you/your-tree","ts":"…"}` line. Your
  slot keeps a stump — the grove remembers, honestly but kindly. (You can
  replant later; you'll take a fresh slot at the current rim.)
- **Move to another clearing**: `{"kind":"transplanted","tree":"…","to":"other-clearing","ts":"…"}`.
- **Repo renamed**: `{"kind":"renamed","tree":"old/name","to":"new/name","url":"…","ts":"…"}` — same spot, new pointer.

## 🧑‍🌾 Keeper's handbook

The **keeper** is whoever maintains this repo. The role is deliberately small:

- **Merge ceremonies.** CI does the eyeballing; you do the judgement. The one
  check you may consciously override: *PR author owns the tree* fails for
  org-owned trees — merge if you know the person speaks for that org.
- **Declare clearings** for communities that ask (a one-line PR you can author
  yourself). Remember: a clearing reserves space for its full capacity at
  creation and can never be un-declared — only left to moss over.
- **Never touch history.** No sorting, no deduping, no "cleanup" of
  `plantings.jsonl` — file order is the whole coordination system. If a line
  must truly vanish (takedown request), replace it in place with
  `{"kind":"reserved","clearing":"<its clearing>","ts":"…"}` so every later
  tree keeps its exact spot, and note why in the commit message.
- **Never change `grove.yml` placement values after the first planting**
  (`seed`, `plotPitch`, `clearingCapacity`): that moves every tree — the one
  betrayal this design exists to prevent. Fill them in *before* anyone plants.
- **Hand over the keys** when you step down: add a co-maintainer, note it in
  the README. A grove should outlive its first keeper.

## Checking placement locally

```bash
node tools/validate-ceremony.mjs --base /dev/null --head plantings.jsonl
```

`tools/place.mjs` is vendored byte-for-byte from the main project's
[`grove/place.mjs`](https://github.com/webmemo-code/ai-learning-tree/blob/main/grove/place.mjs)
at `placeVersion 1.0.0` — self-contained on purpose: your grove keeps working
even if the mother tree falls.
