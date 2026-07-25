#!/usr/bin/env bash
# Build the CellScript WASM bundle for the website playground.
#
# Produces cellscript_wasm_bg.wasm + cellscript_wasm.js in
# website/public/wasm/. The .wasm is compiled with size optimisation
# to stay within the RFC's 600KB gzip budget.
#
# Usage:
#   website/scripts/build-wasm.sh
#
# Requires: Docker. The script re-enters itself in a SHA-256-pinned
# Linux/amd64 toolchain container.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$REPO/website/public/wasm"
WASM="$REPO/crates/cellscript-wasm/pkg/cellscript_wasm_bg.wasm"

if [[ "${CELLSCRIPT_WASM_CANONICAL_CONTAINER:-0}" != "1" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "error: Docker is required for the canonical WASM build" >&2
    exit 1
  fi

  CKB_SDK_RUST_REPO="${CKB_SDK_RUST_REPO:-$REPO/../ckb-sdk-rust}"
  if [[ ! -d "$CKB_SDK_RUST_REPO" ]]; then
    echo "error: missing sibling ckb-sdk-rust checkout: $CKB_SDK_RUST_REPO" >&2
    exit 1
  fi
  CKB_SDK_RUST_REPO="$(cd "$CKB_SDK_RUST_REPO" && pwd)"

  IMAGE="cellscript-wasm-builder:rust-1.97.1-wasm-bindgen-0.2.121-binaryen-131"
  docker build \
    --platform linux/amd64 \
    --tag "$IMAGE" \
    --file "$REPO/website/scripts/wasm-builder.Dockerfile" \
    "$REPO/website/scripts"
  docker run --rm \
    --platform linux/amd64 \
    --env CELLSCRIPT_WASM_CANONICAL_CONTAINER=1 \
    --env CARGO_TARGET_DIR=/work/CellScript/target/wasm-reproducible \
    --volume "$REPO:/work/CellScript" \
    --volume "$CKB_SDK_RUST_REPO:/work/ckb-sdk-rust:ro" \
    --workdir /work/CellScript \
    "$IMAGE" \
    website/scripts/build-wasm.sh
  exit 0
fi

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "error: canonical WASM container must be Linux/amd64" >&2
  exit 1
fi

if ! command -v wasm-opt >/dev/null 2>&1; then
  echo "error: wasm-opt (Binaryen) is required for the 600 KB gzip budget" >&2
  exit 1
fi
if ! command -v wasm-bindgen >/dev/null 2>&1; then
  echo "error: official wasm-bindgen 0.2.121 is required" >&2
  exit 1
fi

EXPECTED_WASM_OPT_VERSION_PREFIX="wasm-opt version 131"
ACTUAL_WASM_OPT_VERSION="$(wasm-opt --version)"
if [[ "$ACTUAL_WASM_OPT_VERSION" != "$EXPECTED_WASM_OPT_VERSION_PREFIX"* ]]; then
  echo "error: expected $EXPECTED_WASM_OPT_VERSION_PREFIX, found $ACTUAL_WASM_OPT_VERSION" >&2
  exit 1
fi
EXPECTED_WASM_BINDGEN_VERSION="wasm-bindgen 0.2.121"
ACTUAL_WASM_BINDGEN_VERSION="$(wasm-bindgen --version)"
if [[ "$ACTUAL_WASM_BINDGEN_VERSION" != "$EXPECTED_WASM_BINDGEN_VERSION" ]]; then
  echo "error: expected $EXPECTED_WASM_BINDGEN_VERSION, found $ACTUAL_WASM_BINDGEN_VERSION" >&2
  exit 1
fi

CARGO_HOME_DIR="${CARGO_HOME:-${HOME}/.cargo}"
UNIT_SEPARATOR=$'\x1f'
ENCODED_RUSTFLAGS="-Copt-level=z"
ENCODED_RUSTFLAGS+="${UNIT_SEPARATOR}--remap-path-prefix=$REPO=/src/cellscript"
ENCODED_RUSTFLAGS+="${UNIT_SEPARATOR}--remap-path-prefix=$CARGO_HOME_DIR=/cargo"

echo "Building cellscript-wasm (size-optimised release)..."
cd "$REPO"
env -u RUSTFLAGS \
  CARGO_ENCODED_RUSTFLAGS="$ENCODED_RUSTFLAGS" \
  CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1 \
  wasm-pack build \
    --no-opt \
    --mode no-install \
    crates/cellscript-wasm \
    --target web \
    --no-default-features \
    --features wasm

echo "Optimising WASM with wasm-opt -Oz..."
wasm-opt -Oz "$WASM" -o "$WASM.optimized"
mv "$WASM.optimized" "$WASM"

echo "Copying bundle to $OUT..."
mkdir -p "$OUT"
cp crates/cellscript-wasm/pkg/cellscript_wasm_bg.wasm "$OUT/"
cp crates/cellscript-wasm/pkg/cellscript_wasm.js "$OUT/"
cp crates/cellscript-wasm/pkg/cellscript_wasm.d.ts "$OUT/"
cp crates/cellscript-wasm/pkg/cellscript_wasm_bg.wasm.d.ts "$OUT/"

RAW=$(wc -c < "$OUT/cellscript_wasm_bg.wasm")
GZIP=$(gzip -c "$OUT/cellscript_wasm_bg.wasm" | wc -c)
echo ""
echo "WASM bundle size:"
echo "  raw:   $RAW bytes ($(( RAW / 1024 )) KB)"
echo "  gzip:  $GZIP bytes ($(( GZIP / 1024 )) KB)"
if [ "$GZIP" -le 614400 ]; then
  echo "  budget: PASS (<= 600 KB gzip)"
else
  echo "  budget: OVER 600 KB gzip — review included code paths"
  exit 1
fi
