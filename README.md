# 🌲🌲 My AI learning journey — the first grove

A **grove** is a shared map of people who are learning AI. Everyone has their
own repo (their "tree") where they track what they've learned. This repo just
lists them, so you can see who's around, what they're working on, and go ask
them how they did it.

Nothing about your learning is stored here — only a link to your own repo. This
is a map, not a warehouse.

This is the first grove, planted on 2026-07-14 and looked after by
[@webmemo-code](https://github.com/webmemo-code). There's room for 255 more
people. **You're welcome to join** — see below.

New to all this? Start with the
[AI learning tree project](https://github.com/webmemo-code/ai-learning-tree),
which explains what a tree is and how to make one.

## 🌱 How to join

You'll add one line to a file in this repo. Adding a line means opening a
"pull request" — a request for the maintainer to accept your change. You can do
the whole thing in your browser; you don't need to install anything.

### Step 1 — Have a tree

You need your own tree repo first, with a `data/tree.json` file that's publicly
readable on the internet. The
[main project](https://github.com/webmemo-code/ai-learning-tree) walks you
through setting one up.

Copy the link to your `tree.json`. The easiest way: open `data/tree.json` on
GitHub, click the **Raw** button, and copy the address bar. It looks like this:

```
https://raw.githubusercontent.com/your-name/your-tree/main/data/tree.json
```

### Step 2 — Write your line

Take this template and replace the three parts in caps:

```json
{"kind":"planted","tree":"YOUR-NAME/YOUR-TREE","url":"YOUR-RAW-TREE-JSON-URL","clearing":"commons","ts":"TODAYS-DATE"}
```

| Part | What to put there |
| --- | --- |
| `tree` | Your repo, as `owner/repo` — e.g. `webmemo-code/ai-learning-tree` |
| `url` | The raw link you copied in step 1 |
| `clearing` | Leave it as `commons` unless you've been given a team name (see below) |
| `ts` | The current time, like `2026-07-14T21:07:54Z` — [get one here](https://www.timeanddate.com/worldclock/timezone/utc) or just use today's date with `T12:00:00Z` at the end |

It must all be on **one line**, and the quotes matter. If you're unsure, paste
it into [jsonlint.com](https://jsonlint.com) to check it's valid.

### Step 3 — Add it to the file

1. Open [`plantings.jsonl`](plantings.jsonl) here on GitHub.
2. Click the **pencil icon** (✏️ "Edit this file"). GitHub will offer to make
   your own copy of the repo — say yes.
3. Go to the very **end** of the file and paste your line on a new line.
   **Don't change or move any existing line** — the order of this file is what
   decides where everyone stands, so it must never be rearranged.
4. Click **Commit changes**, then **Propose changes**, then
   **Create pull request**.

### Step 4 — Wait for the checks and the merge

An automatic check runs on your pull request. It confirms your line is
well-formed, that you own the repo you listed, and that nothing above your line
was changed. If it goes red, click into it — the message says what to fix, and
you can edit your pull request and try again.

Once it's green, the keeper merges it. **You're planted.** Your spot in the
grove is yours for as long as the grove stands.

> **Joining as a team?** Ask the keeper (open an issue) for a *clearing* — a
> named area where your team stands together. Once it exists, use its name
> instead of `commons` in your line.

## 🍂 Leaving, moving, renaming

Same idea every time: open a pull request that adds **one new line** at the end
of `plantings.jsonl`. You never delete or edit old lines.

**Leave the grove:**

```json
{"kind":"felled","tree":"your-name/your-tree","ts":"2026-07-14T21:07:54Z"}
```

Your spot keeps a stump, so the grove remembers you were here. You can come
back later — you'll get a fresh spot at the edge.

**Move to another clearing:**

```json
{"kind":"transplanted","tree":"your-name/your-tree","to":"other-clearing","ts":"2026-07-14T21:07:54Z"}
```

**You renamed your repo:**

```json
{"kind":"renamed","tree":"old-name/old-tree","to":"new-name/new-tree","url":"https://raw.githubusercontent.com/new-name/new-tree/main/data/tree.json","ts":"2026-07-14T21:07:54Z"}
```

You keep your spot; only the link changes.

## 🚶 Walking the grove

`walk/index.html` is a 3D view of everyone standing here. It needs to be served
over the web, so either turn on GitHub Pages for this repo
(Settings → Pages → deploy from branch → `/ (root)`) and visit `/walk/`, or run
this from the repo folder on your computer and open
<http://localhost:8000/walk/>:

```bash
python -m http.server
```

## 🧑‍🌾 For the keeper

The keeper is whoever maintains this repo. The job is small on purpose.

- **Merge the pull requests.** CI does the checking; you make the judgement
  calls. The one check worth overriding by hand: *PR author owns the tree*
  fails for org-owned trees — merge anyway if you know the person speaks for
  that org.
- **Create clearings** when a community asks (a one-line pull request you can
  write yourself). A clearing reserves space for its full capacity the moment
  it's created, and can never be removed afterwards.
- **Never touch history in `plantings.jsonl`.** No sorting, no deduping, no
  tidying — file order is the whole system. If a line genuinely must go (a
  takedown request), replace it in place with
  `{"kind":"reserved","clearing":"<its clearing>","ts":"…"}` so everyone below
  it keeps their exact spot, and explain why in the commit message.
- **Never change the placement values in `grove.yml`** (`seed`, `plotPitch`,
  `clearingCapacity`) once anyone has planted. Changing them moves every tree
  in the grove — the one thing this design exists to prevent. Set them before
  the first planting.
- **Hand over the keys** when you step down: add a co-maintainer and note it
  here. A grove should outlive its first keeper.

### Checking a planting locally

With [Node.js](https://nodejs.org) installed:

```bash
node tools/validate-ceremony.mjs --base /dev/null --head plantings.jsonl
```

`tools/place.mjs` is copied byte-for-byte from the main project's
[`grove/place.mjs`](https://github.com/webmemo-code/ai-learning-tree/blob/main/grove/place.mjs)
at `placeVersion 1.0.0`. That's deliberate: this grove keeps working even if the
main project disappears.

## 📖 Want the details?

How spots are assigned, and why nobody's tree ever moves once planted:
[docs/05-grove.md](https://github.com/webmemo-code/ai-learning-tree/blob/main/docs/05-grove.md)
(and ADR-0006 / ADR-0007 in the same project).
