---
name: new-note
description: Add a note or reading note to the Notes page on Kailan's site. Use when Kailan wants to post a thought, daily log, reading note, or short write-up.
---

# Add a note

Notes are Kailan's daily log — short, personal, mixed Chinese/English. The voice is Kailan's, not yours.

## 1. Get the content

- If Kailan gives finished text, keep it. Only fix typos and obvious punctuation; never rewrite the voice.
- If Kailan gives rough bullet points, draft it, then show the draft and wait for an OK before publishing.
- Pick `type`: `note` (thoughts, daily life, design observations) or `reading` (books, articles, talks).

## 2. Where the text lives

- **Short note** (a paragraph or two): only a list entry — set `excerpt` to the text, no `link`.
- **Longer note**: create `notes/<YYYY-MM-DD>-<slug>/index.html` using the same `<head>`, nav and footer as
  `notes/index.html`, with a simple article layout (title in `.serif`, date in `.mono`, body max ~38em wide,
  1.75 line-height). Set `link` to that path and `excerpt` to a one-sentence summary.
- Photos go next to the note page; compress to ≤ 1600px wide.

## 3. Update the data

Add to the top of `data/notes.json`:

```json
{ "date": "YYYY-MM-DD", "type": "note", "title": "…", "excerpt": "…", "tags": ["…"], "link": "optional" }
```

Reuse existing tags (see CLAUDE.md). Notes don't need an extra `update` changelog entry — the note itself shows up.

## 4. Check and hand back

Validate JSON, serve locally, screenshot `/notes/` (and the note page if any), commit `Add note: <title>`,
then ask Kailan whether to push.
