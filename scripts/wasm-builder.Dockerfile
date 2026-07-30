FROM rust:1.97.1-slim-bookworm@sha256:99e09cb2284e2ddbb73a995deee3e91783fd04d177602ccf6eab326d778ee777

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN rustup target add wasm32-unknown-unknown

RUN curl --fail --location --retry 3 \
        --output /tmp/wasm-pack.tar.gz \
        https://github.com/wasm-bindgen/wasm-pack/releases/download/v0.13.1/wasm-pack-v0.13.1-x86_64-unknown-linux-musl.tar.gz \
    && printf '%s  %s\n' \
        c539d91ccab2591a7e975bcf82c82e1911b03335c80aa83d67ad25ed2ad06539 \
        /tmp/wasm-pack.tar.gz \
        | sha256sum --check \
    && tar -xzf /tmp/wasm-pack.tar.gz -C /tmp \
    && install -m 0755 \
        /tmp/wasm-pack-v0.13.1-x86_64-unknown-linux-musl/wasm-pack \
        /usr/local/bin/wasm-pack \
    && rm -rf \
        /tmp/wasm-pack.tar.gz \
        /tmp/wasm-pack-v0.13.1-x86_64-unknown-linux-musl

RUN curl --fail --location --retry 3 \
        --output /tmp/wasm-bindgen.tar.gz \
        https://github.com/wasm-bindgen/wasm-bindgen/releases/download/0.2.121/wasm-bindgen-0.2.121-x86_64-unknown-linux-musl.tar.gz \
    && printf '%s  %s\n' \
        3039f38f65fe237b640cf06a140c919ca8d717ec5012146d145d3f27bb4d6b28 \
        /tmp/wasm-bindgen.tar.gz \
        | sha256sum --check \
    && tar -xzf /tmp/wasm-bindgen.tar.gz -C /tmp \
    && install -m 0755 \
        /tmp/wasm-bindgen-0.2.121-x86_64-unknown-linux-musl/wasm-bindgen \
        /usr/local/bin/wasm-bindgen \
    && install -m 0755 \
        /tmp/wasm-bindgen-0.2.121-x86_64-unknown-linux-musl/wasm-bindgen-test-runner \
        /usr/local/bin/wasm-bindgen-test-runner \
    && rm -rf \
        /tmp/wasm-bindgen.tar.gz \
        /tmp/wasm-bindgen-0.2.121-x86_64-unknown-linux-musl

RUN curl --fail --location --retry 3 \
        --output /tmp/binaryen.tar.gz \
        https://github.com/WebAssembly/binaryen/releases/download/version_131/binaryen-version_131-x86_64-linux.tar.gz \
    && printf '%s  %s\n' \
        b5bf1f0eaf17c63ee588ff7a5954dc8f6ce2c26989051c66f24dfe9ece3e46db \
        /tmp/binaryen.tar.gz \
        | sha256sum --check \
    && tar -xzf /tmp/binaryen.tar.gz -C /tmp \
    && install -m 0755 \
        /tmp/binaryen-version_131/bin/wasm-opt \
        /usr/local/bin/wasm-opt \
    && rm -rf /tmp/binaryen.tar.gz /tmp/binaryen-version_131
