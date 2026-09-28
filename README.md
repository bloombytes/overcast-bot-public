# Overcast — public calendar

This repo is the public, static-hosted half of [Overcast](https://github.com/bloombytes/overcast-bot). It's served via GitHub Pages at [tea4tea.com](https://tea4tea.com).

`index.html` / `app.js` / `style.css` are the frontend, maintained by hand here.

`categories.json`, `venues.json`, `events.json`, and `posters/` are **generated** — pushed automatically every ~6 hours by `scripts/export_static_site.py` in the private `overcast-bot` repo, via the GitHub Contents API. Don't hand-edit them; changes get overwritten on the next export.
