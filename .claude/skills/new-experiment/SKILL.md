---
name: new-experiment
description: Add a new AI experiment to the Playground on Kailan's site. Use when Kailan says they made something new (a tool, visual, toy, prompt result, Claude artifact, CodePen, video…) and wants it on the site.
---

# Add a Playground experiment

Kailan will describe what they made, often loosely ("我用 Claude 做了一個會跟著音樂跳的粒子"). Your job is to turn that into
a card on `/playground/` with as little back-and-forth as possible.

## 1. Gather what you need

Ask only for what you can't infer, in one message:
- **What it is** — one sentence. You write the final description; Kailan doesn't need to.
- **Where it lives** — one of:
  - code/HTML Kailan pasted or attached → host it in `playground/<slug>/index.html`
  - an external link (Claude artifact, CodePen, YouTube, Figma…) → link out to it
- **A preview image** if they have one (screenshot/GIF). If not, you will make one (step 3).

Don't ask about tags, label, slug or date — choose them yourself.

## 2. Add the files

- `slug`: short kebab-case English, e.g. `music-particles`.
- Hosted experiments go in `playground/<slug>/index.html`. Make the page self-contained (inline CSS/JS or files in the
  same folder), white background, and add a small top bar with the title (Newsreader) and a `← Playground` link
  to `/playground/` — copy the bar from `playground/dot-field/index.html`.
- Never load secrets or API keys in client code. If an experiment needs an API key, stop and tell Kailan.

## 3. Thumbnail

Save `playground/<slug>/thumb.png` (or `.jpg`/`.gif`), ideally 800×500. If Kailan gave none and the experiment is
hosted here, screenshot it with Playwright (Chromium is preinstalled; `require('playwright')`) at 800×500 after it has
had a moment to animate. For external links with no image, leave `thumb` out — the card shows a placeholder.

## 4. Update the data

Add to the top of `data/experiments.json`:

```json
{
  "slug": "music-particles",
  "title": "Music Particles",
  "date": "YYYY-MM-DD",
  "description": "One or two sentences, plain and specific. Mention the AI tool used if relevant.",
  "tags": ["AI", "..."],
  "label": "New",
  "link": "/playground/music-particles/",
  "thumb": "/playground/music-particles/thumb.png",
  "how": "optional — link to a Notes entry or external write-up about how it was made"
}
```

- Tags: reuse existing tags from `data/experiments.json`, `data/notes.json`, `data/works.json` first (see CLAUDE.md).
- Set `label: "New"` on the new item and remove `New` from items older than ~30 days.
- Then add a changelog line to the top of `data/notes.json`:
  `{ "date": "YYYY-MM-DD", "type": "update", "title": "Added experiment: <Title>", "link": "<link>", "tags": ["AI"] }`

## 5. Check and hand back

- Validate JSON: `python3 -m json.tool data/experiments.json > /dev/null && python3 -m json.tool data/notes.json > /dev/null`
- Serve (`python3 -m http.server 8000`) and screenshot `/playground/` and the experiment page; check no console errors.
- Commit: `Add experiment: <Title>`.
- Tell Kailan in Chinese what was added, show the screenshot, and ask whether to push (push to `main` = live).
