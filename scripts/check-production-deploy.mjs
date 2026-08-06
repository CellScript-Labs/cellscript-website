import { readFile } from "node:fs/promises";

const compose = await readFile(new URL("../deploy/docker-compose.production.yml", import.meta.url), "utf8");
const nginx = await readFile(new URL("../deploy/nginx.conf", import.meta.url), "utf8");

function requireText(source, value, label) {
  if (!source.includes(value)) {
    throw new Error(`production deployment is missing ${label}: ${value}`);
  }
}

for (const [value, label] of [
  [":/usr/share/nginx/html:ro", "read-only site mount"],
  [":/etc/nginx/conf.d/default.conf:ro", "read-only nginx config"],
  ["read_only: true", "read-only container root"],
  ["/var/cache/nginx:size=16m", "bounded cache tmpfs"],
  ["/var/run:size=1m", "bounded runtime tmpfs"],
  ["/tmp:size=4m", "bounded temporary tmpfs"],
  ["no-new-privileges:true", "no-new-privileges"],
  ["healthcheck:", "health check"],
  ["max-size: \"10m\"", "log size rotation"],
  ["max-file: \"3\"", "log file rotation"],
]) {
  requireText(compose, value, label);
}

requireText(nginx, "server_tokens off", "server-token suppression");
requireText(nginx, "absolute_redirect off", "proxy-safe relative directory redirects");
requireText(nginx, "gzip_types application/wasm", "WASM response compression");
requireText(nginx, "location ~* \\.wasm$", "dedicated WASM asset policy");
requireText(nginx, "public, max-age=31536000, immutable", "versioned WASM immutable caching");
for (const header of [
  "Permissions-Policy",
  "Referrer-Policy",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "X-Permitted-Cross-Domain-Policies",
]) {
  const occurrences = nginx.split(`add_header ${header} `).length - 1;
  if (occurrences < 3) {
    throw new Error(`production nginx must preserve ${header} on HTML, WASM, and static assets`);
  }
}

console.log("production deployment contract ok");
