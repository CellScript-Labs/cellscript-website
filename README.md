# CellScript Website

This is the public CellScript website: the landing page, registry browser, learning pages, and in-browser playground shell.

It is built with Astro and kept deliberately static. The site should be easy to deploy, easy to audit, and useful to someone arriving from GitHub or a search result who wants to understand what CellScript does.

## What The Site Contains

- A first-page overview of CellScript and its CKB contract workflow.
- A registry browser backed by generated package metadata.
- A playground page with the current web-facing compiler assets.
- Learning and documentation entry points.
- Design and audit notes under `docs/`.

## Run It Locally

```bash
npm ci
npm run dev
```

The dev server binds to `127.0.0.1` by default.

## Build For Production

```bash
npm run build
```

The build runs registry data generation, Astro type checking, and static site generation. Output is written to `dist/`.

## Registry Data

The site includes generated registry metadata at:

```text
src/data/registry-packages.json
```

When this repository is checked out as a submodule inside the main CellScript repository, the generator can scan the parent checkout for package metadata. When this repository is used standalone and no package sources are present, the generator keeps the committed registry data instead of erasing it.

Manual regeneration:

```bash
npm run prepare:registry
```

To point the generator at a specific CellScript checkout:

```bash
CELLSCRIPT_REGISTRY_ROOT=/path/to/CellScript npm run prepare:registry
```

## Updating Live Activity Data

GitHub release and commit activity is stored in:

```text
src/data/github-activity.json
```

Refresh it with:

```bash
python3 scripts/fetch-github-data.py
```

The GitHub Actions workflow in this repo runs the same refresh on a schedule.

## Design Notes

The site should read like a product and documentation front door, not like an internal build artifact. Keep first-screen language clear, avoid protocol jargon before it is introduced, and keep claims tied to actual compiler, package, or deployment evidence.

Useful references:

- `docs/CELLSCRIPT_WEBSITE_PARADIGM_UPGRADE_RFC.md`
- `docs/CELLSCRIPT_PLAYGROUND_UI_AUDIT.md`
