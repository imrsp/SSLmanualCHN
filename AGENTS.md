# Agent Working Guide

## Project intent

Maintain a complete, reviewable Chinese edition of the SSL Live manual and publish it as a fast static website. Preserve the English source, document structure, images, tables, product names, UI labels, numbers, and links.

## Read first

1. Read `README.md`, then the relevant file under `docs/` for the task.
2. Read `content/manifest.json` and `content/site.json` before changing chapter metadata, sections, or Chinese titles.
3. Read `docs/glossary.csv` and `docs/TERMINOLOGY.md` before translating, proofreading, or changing terminology rules.
4. Treat `upstream/` as source snapshots, not editable site content.
5. Never edit `dist/`; regenerate it with `npm run build`.

## How to use `docs/`

- `docs/TRANSLATION.md`: translation, proofreading, validation order, and report-handling rules.
- `docs/TERMINOLOGY.md` + `docs/glossary.csv`: terminology policy, glossary maintenance, and terminology-audit behavior.
- `docs/STYLING.md`: reader UI, theme system, token model, and theme preset workflow.
- `docs/ARCHITECTURE.md`: build pipeline, data files, standalone pages, and directory responsibilities.
- `docs/CONTRIBUTING.md`: day-to-day editing rules, Git hygiene, and pre-submit checks.
- `docs/DEPLOYMENT.md`: deploy targets, cache behavior, and static hosting assumptions.
- `docs/UPSTREAM_SNAPSHOTS.md`: upstream snapshot capture and baseline management.
- `docs/EXTERNAL_TRANSLATION.md`: optional external-LLM drafting workflow only.
- `docs/theme-tokens.css`: reference copy of theme tokens; not loaded by the build.

Do not assume every file under `docs/` is runtime input. Some files are build inputs, some are process rules, and some are human-facing reference material.

## Content rules

- English baseline: `content/en/pages/NN-Slug.html`
- Chinese translation: `content/zh/pages/NN-Slug.html`
- Keep matching filenames and structural elements in both languages.
- Keep UI labels, menu paths, product names, protocols, commands, numbers, units, IP addresses, model names, and literal warning/error text intact unless the project rule for that class says otherwise.
- Chapter metadata changes usually require both `content/manifest.json` and `content/site.json`.
- Standalone pages are an exception to the chapter pair rule: they live only in `content/zh/pages/`, are discovered by meta tags, and do not appear in the catalog or search index.

## Validation policy

Use `npm run check` as the default final gate. It runs build + validation + all audits.

Current blocking rules:

- `npm run validate`: fails on hard structural or completeness problems.
- `npm run audit:links`: fails on broken internal page links, missing anchors, or unlocalized in-site fragment links.
- `npm run audit:terminology`: report findings are non-blocking, but malformed `docs/glossary.csv` or duplicate `term_en` rows fail because the report is then unreliable.

Current report-only outputs:

- `reports/CONTENT_AUDIT.md`
- `reports/TERMINOLOGY_AUDIT.md`
- `reports/EXTERNAL_LINK_AUDIT.md`
- report-only sections inside `VALIDATION_PROJECT.md` and `VALIDATION_TRANSLATIONS.md`

Do not invent extra fail conditions in agent work. If an issue is not a defined blocker, write or use the report path and leave the pass/fail boundary unchanged unless explicitly asked to redesign it.

## Engineering rules

- Runtime code should stay dependency-free unless a dependency has a clear, documented benefit.
- Use relative URLs so the site works at a domain root or subpath.
- Keep chapter payloads separate; do not rebuild a monolithic manual blob.
- Use Node.js scripts compatible with macOS and Linux.
- Run `npm run check` after content, metadata, script, or frontend changes.
- For frontend changes, also run `npm run serve` and inspect desktop and mobile layouts.

## Generated output

`dist/` is the deployable site. Expect generated filenames and data in these groups:

- `index.html`
- hashed app shell assets such as `app.<hash>.js` and `styles.<hash>.css`
- `data/catalog.json` and `data/catalog.js`
- `data/search-index-zh.json` / `.js`
- `data/search-index-en.json` / `.js`
- `data/themes.json` / `.js`
- `data/pages/*.json` / `.js`
- `themes/*.css`
- `assets/manual/**`

When opened through `file://`, the reader falls back to the generated `.js` data files. When served over HTTP, it loads the JSON equivalents.
