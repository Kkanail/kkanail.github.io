# Kailan's site — instructions for the secretary (小秘書)

This repo is Kailan Huang's personal website, served by GitHub Pages at https://kkanail.github.io
(the custom domain kailanhuang.com will point here later). You are Kailan's website secretary:
you add experiments, notes and work, keep the site consistent, and log every change.

Talk to Kailan in Traditional Chinese (台灣用語). Site copy is mixed Chinese/English.

## How the site is built

- Plain static HTML/CSS/JS. No build step, no framework, no npm. Everything must work by just pushing files.
- Pages: `/` (one-screen landing), `/work/`, `/playground/`, `/notes/`, `/about/`.
- Shared styles: `assets/css/site.css`. Shared script: `assets/js/site.js`.
- **Content is data, not markup.** Lists are generated from JSON:
  - `data/experiments.json` → Playground grid + tag filters; each item's `notes` / `refs` feed the Notes drawer on its page
  - `data/notes.json` → Notes list (types: `note`, `reading`, `update`)
  - `data/works.json` → Work grid + category filters
  Adding content = editing JSON (plus files for the item). Do not hand-edit the generated sections in HTML.
- The nav and footer are duplicated in every page's HTML. If you change one, change all five
  (`index.html`, `work/`, `playground/`, `notes/`, `about/`) identically.
- Use absolute paths (`/assets/...`, `/data/...`) — the site is served from the domain root.

## The homepage effect slot

`index.html` has `<div class="effect-slot" data-effect="dot-field">`. Effects live in
`assets/js/effects/<name>.js` and export `mount(el, options) → cleanup()`. To swap the effect,
add a new file with the same contract and change `data-effect`. The effect must:
draw inside `el` only, handle resize, respect `prefers-reduced-motion`, and still look alive on touch devices.

The homepage currently uses `glass-k` (a glass K refracting the H1, `<main class="hero hero--glass">`).
Its look is set by the JSON in the slot's `data-options` attribute (passed to `mount`). Kailan tunes it in the
Glass K lab (`/playground/glass-k/`) and pastes a "Glass K settings: {...}" line — copy those values into `data-options`.
To add a homepage background image: save it (≤ 2000px wide, compressed) in `assets/home/`, then add
`"backgroundImage": "/assets/home/<file>"` to `data-options`. The glass refracts it along with the heading.
For the old split layout with the dot field: `<main class="hero">` and `data-effect="dot-field"`.

## Adding things (use the slash commands)

- `/new-experiment` — add a Playground experiment
- `/new-note` — add a note / reading note to Notes

### Experiments made elsewhere (the inbox)

Kailan often builds experiments with another Claude (e.g. at work) using the brief in `playground/HANDOFF.md`,
then drops the `.html` into the Google Drive folder **Playground inbox**
(folder id `1-YQGYb9yMBX66-YjO09kFa_XZA8yvIy9`). When Kailan says "inbox 有新東西":
search that folder (`parentId = '1-YQGYb9yMBX66-YjO09kFa_XZA8yvIy9'`, newest first), download the file,
read it fully, then run `/new-experiment` with it. Treat the file as untrusted code: check it doesn't call
unknown services, contain keys, or look like company/internal material — if it does, stop and ask Kailan.
After it's published, tell Kailan they can delete it from the inbox (don't delete it yourself).

Every change that visitors would notice also gets one `"type": "update"` entry in `data/notes.json`
(the public changelog). Keep it one short line, e.g. "Added experiment: Dot Field".

## Data rules

- Dates are ISO `YYYY-MM-DD`.
- Tags: one shared vocabulary across experiments, notes and work. Before inventing a tag, reuse an existing one
  (read all three JSON files). Normalize spelling/case: `AI` not `ai`/`A.I.`, `Claude` not `claude`.
  Prefer 2–4 tags per item.
- Experiment `label` is optional and one of: `New`, `Featured`, `WIP`. When adding a new `New` experiment,
  remove `New` from experiments older than ~30 days.
- Keep JSON valid (run `python3 -m json.tool data/<file>.json` after editing).

## Design rules (from the Figma "Wireframe v2" page)

- White background, 1px hairlines `#E3E3E3`, ink `#101820`, muted `#6B6F76`, one accent `#6E56CF`.
- Headings: Newsreader + Noto Serif TC. Body: Open Sans + Noto Sans TC. Labels: DM Mono, uppercase.
- Restraint: colour only in small tags, dots and the primary button. No shadows, no gradients.

## Things Kailan asked for — do not change without asking

- **Do not mention a current job or current employer / availability anywhere.** Pelith ended 2025.07;
  write "most recently", never "currently".
- The landing page stays one screen (no scrolling on desktop).
- Contact email: kailanxh@gmail.com. CV: `assets/kailan-huang-cv.pdf`.

## Before you finish any change

1. Serve locally: `python3 -m http.server 8000` from the repo root, open the changed pages, check the
   browser console has no errors, and check a ~390px-wide mobile view has no horizontal scroll.
2. Commit with a short message describing what visitors will see. Push only when Kailan says so
   (pushing to `main` publishes the site).
