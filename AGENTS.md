# Agent Working Guide

## Project intent

Maintain a complete, reviewable Chinese edition of the SSL Live manual and publish it as a fast static website. Preserve the English source, document structure, images, tables, product names, UI labels, numbers, and links.

## Read first

1. Read `README.md` and the relevant file under `docs/`.
2. Read `content/site.json` before changing chapter metadata.
3. Read `content/glossary.csv` and `content/TERMINOLOGY.md` before translating.
4. Treat `upstream/` as a source snapshot, not editable site content.
5. Never edit `dist/`; regenerate it with `npm run build`.

## Content rules

- English baseline: `content/en/pages/NN-Slug.html`
- Chinese translation: `content/zh/pages/NN-Slug.html`
- Keep matching filenames and structural elements in both languages.
- Keep UI labels, menu paths, product names, protocols, commands, numbers, units, IP addresses, and model names unchanged.
- Add or change terminology in both `content/glossary.csv` and `content/TERMINOLOGY.md`.
- Add chapter metadata to `content/en/manifest.json`, `content/site.json`, and both language page directories.

## Engineering rules

- Runtime code must remain dependency-free unless a dependency has a clear, documented benefit.
- Use relative URLs so the site works at a domain root or subpath.
- Keep chapter payloads separate; do not rebuild a monolithic HTML or JSON bundle.
- Use Node.js scripts compatible with macOS and Linux.
- Run `npm run check` after content, metadata, script, or frontend changes.
- For frontend changes, also run `npm run serve` and inspect desktop and mobile layouts.

## Generated output

`dist/` contains the complete deployable site:

- `index.html`, `app.js`, `styles.css`
- `data/catalog.json`
- `data/search-index.json`
- `data/pages/*.json`
- `assets/manual/**`
