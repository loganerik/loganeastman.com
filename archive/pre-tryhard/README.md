# Archive: loganeastman.com before TRYHARD

Archived on 2026-11-21 from the `main` branch at commit `eb9d522`, immediately
before the site was rebuilt as **TRYHARD / in a whytry world**.

Everything in this folder is preserved byte-for-byte via `git mv`, so `git log
--follow` on any file shows its full history. Hugo does not read this folder:
nothing here is published.

## What is here

| Folder | Original location | Notes |
|---|---|---|
| `content/` | `content/` | All 21 Markdown files, original tree and front matter |
| `static/img/` | `static/img/` | Every image/video the old pages referenced (`/img/...`) |
| `static/css/main.css` | `static/css/main.css` | The old stylesheet |
| `static/favicon.svg` | `static/favicon.svg` | The old favicon |
| `layouts/` | `layouts/` | Old templates, incl. the portfolio password gate (`portfolio/list.html`) |
| `archetypes/writing.md` | `archetypes/writing.md` | Old post archetype |
| `hugo.toml` | `hugo.toml` | Old site config (copy, for the menu definitions) |

### Content inventory

- `_index.md` (home), `about.md`, `work.md`
- `newsletter/_index.md` (Substack embed page)
- `portfolio/_index.md` + 6 case studies (`home`, `all-for-kids`, `project-slush`, `logitech`, `vertical-harvest`, `b-movement-builders`), password-gated, `noindex`
- `writing/_index.md` + 9 posts:
  - published: `sicario-is-contrived`, `steve-jobs-in-a-closed-system`, `immovable-beast`, `if-only-i-were-asleep`, `making-grand-work`, `theyre-eating-the-tripe`
  - drafts: `los-angeles-after-hours`, `the-projectionist`, `first-post`

Known issue carried over: `writing/los-angeles-after-hours.md` references three
images (`downtown-night.jpg`, `diner-counter.jpg`, `la-palms.jpg`) that never
existed in `static/img/writing/`.

## Republishing a piece as a TRYHARD column

1. `hugo new content columns/<slug>/index.md`
2. Paste the body in. Map front matter: `title`, `date`, `description` carry
   over; `postType: essay|poem` becomes a category or tag; add `draft: false`.
3. Copy any images from `archive/pre-tryhard/static/img/writing/<slug>/` into
   the new page bundle folder and change `/img/writing/<slug>/x.jpg` to `x.jpg`
   (Hugo resolves bundle resources relative to the column).
4. Raw `<img>`/`<video>` HTML still works (`unsafe = true` is on), but plain
   Markdown images get the gold frame and caption treatment automatically.
