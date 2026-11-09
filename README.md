# CellScript Website

This is the public CellScript website: the landing page, registry browser, learning pages, and in-browser playground shell.

It is built with Astro and kept deliberately static. The site should be easy to deploy, easy to audit, and useful to someone arriving from GitHub or a search result who wants to understand what CellScript does.

## Product Shape

The website is the public front door for three related jobs:

- explain CellScript as a typed-transition language for CKB contracts;
- let readers inspect package and provenance metadata without cloning the compiler;
- provide a browser playground that introduces the compiler workflow before someone installs local tools.

The static architecture is intentional. Most pages are generated from committed source, registry, provenance, and activity data, so the deployed site can be reviewed like an artefact. Dynamic chain or GitHub information is fetched into JSON snapshots first, then rendered by Astro, rather than becoming an opaque runtime dependency.

## What The Site Contains

- A first-page overview of CellScript and its CKB contract workflow.
- A registry browser backed by generated package metadata.
- A Registry submit flow whose compact chooser includes the complete official
  CKB wallet directory: detected CCC CKB signers connect in-browser, while
  other wallets hand off to the same verifiable external-signature contract.
- A playground page with the current web-facing compiler assets.
- Learning and documentation entry points.
- Design and audit notes under `docs/`.

The playground compiles Edition 2027. Every compile API validates the source
edition before compiling.

## Compiler And Source Contract

The current playground uses
`cellscript-source-semantics-2027-0.33-authoring-v3`: explicit semicolons,
comma-separated lists, `new Type { ... }` values and `function::<Type>(...)`
calls. Old source spellings require migration. Example workspaces include
their actual imported files; the site does not rewrite them into standalone
contracts or invent replacement schemas.

Update the native compiler, editor extension and browser assets together.
`cellc language-contract --json`, LSP initialization and the WASM
`source_language_contract_json` export identify the source semantics and
Unicode 17.0.0 tables independently of the Cargo release number. The worker
checks the downloaded WASM against `src/data/compiler-artifact.json`'s SHA-256
and checks the source contract before compiling. A mismatched asset produces
an explicit load error.

The canonical bundle is metadata-only, built with the `wasm` feature. Browser
semantic language services are a separate optional `language-service`
profile; their absence from this bundle is intentional. Native ProofPlan,
typed-semantic and verified-artifact records remain outside the bounded
browser summary. The gzip budget remains 1500 KiB.

From the parent CellScript checkout, rebuild with
`website/scripts/build-wasm.sh`. This uses the pinned Linux/amd64 Docker
toolchain; host-installed older wasm-pack/wasm-bindgen binaries are not the
canonical build. Rust remains pinned to 1.97.1. If a configured download proxy
listens on host loopback on Linux, the supported
`CELLSCRIPT_WASM_DOCKER_NETWORK=host` setting makes it reachable without
changing tool versions or archive checksums.

Focused source-tooling checks are `npm run test:playground-compiler`,
`npm run test:playground-session`, `npm run test:playground-presentation`,
`npm run test:playground-focus`, `npx astro check` and `npx astro build`.
`npm run build` chains the full `build:ci` workflow. Regenerate committed
compiler-derived cards with `CELLSCRIPT_COMPILER=target/debug/cellc npm run
data:regen` after building the matching native compiler in the parent checkout.

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
When building the website repository outside the main CellScript checkout, set
`CELLSCRIPT_REPO_ROOT` to a CellScript checkout so the playground examples and
docs can be embedded:

```bash
CELLSCRIPT_REPO_ROOT=/path/to/CellScript npm run build
```

The wallet directory is deliberately separate from runtime signer discovery.
All twelve official CKB wallet entries remain visible; a wallet is labelled as
direct only when CCC exposes a compatible CKB signer. Other entries open the
wallet's official surface and accept a complete `wallet-signature.json`
handoff. The Registry never accepts recovery phrases, and the API applies the
same public-key, canonical-challenge, and recoverable-signature checks to both
paths. Registry wallet authorisation is mainnet-only; the chooser does not
offer a network switch or construct a testnet CCC client.

Wallet marks under `public/wallets/` are the official SVG assets published by
the Nervos CKB documentation wallet directory. They are committed locally so
the chooser does not depend on third-party favicon services or runtime image
hotlinks; provenance is recorded beside the assets.

## Deploy To Production

The checked-in nginx deployment serves the generated site from a read-only
mount and runs with a read-only root filesystem, bounded temporary filesystems,
health checks, log rotation, `no-new-privileges`, and conservative browser
security headers. It expects the external `stack-network` used by the TLS
reverse proxy.

```bash
cp deploy/.env.example deploy/.env
# Set CELLSCRIPT_SITE_DIST to the absolute generated-site directory.
docker compose --env-file deploy/.env -f deploy/docker-compose.production.yml config
docker compose --env-file deploy/.env -f deploy/docker-compose.production.yml up -d
```

TLS terminates at the shared reverse proxy. The origin still emits HSTS and
anti-embedding/security headers so the HTTPS response retains them through the
proxy.

## Registry Data

The site includes generated registry metadata at:

```text
src/data/registry-packages.json
```

When this repository is checked out as a submodule inside the main CellScript
repository, the generator scans the parent checkout for package metadata. It
rejects a source with no git revision or an origin that is not a credential-free
HTTPS URL. When no source catalogs exist, it writes an explicit empty catalog
instead of retaining an older generated file. Build-time CellScript packages are
classified as `profile_library` when `Cell.toml` declares `metadata.profile`,
otherwise as `source_library`. Source links are pinned to the package
repository revision rather than a moving branch.

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
npm run data:github
```

The GitHub Actions workflow in this repo runs the same refresh on a schedule.
When that workflow commits changed activity data, it also dispatches the
website build workflow explicitly. This is required because commits made by a
workflow token do not reliably trigger a second workflow through the normal
push event.

## Design Notes

The site should read like a product and documentation front door, not like an internal build artifact. Keep first-screen language clear, avoid protocol jargon before it is introduced, and keep claims tied to actual compiler, package, or deployment evidence.

Useful references:

- `docs/CELLSCRIPT_WEBSITE_PARADIGM_UPGRADE_RFC.md`
- `docs/CELLSCRIPT_PLAYGROUND_UI_AUDIT.md`
