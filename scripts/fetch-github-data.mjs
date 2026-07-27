#!/usr/bin/env node
/** Fetch GitHub releases and commits for the website nav rail. */

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { jsonWithAsciiEscapes } from "./ascii-json.mjs";

const REPO = "CellScript-Labs/CellScript";
const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(WEBSITE_ROOT, "..");
const OUT = resolve(WEBSITE_ROOT, "src/data/github-activity.json");

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "cellscript-website" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
  return response.json();
}

function truncate(text, maximum = 140) {
  const characters = Array.from(String(text).trim());
  if (characters.length <= maximum) return characters.join("");
  return `${characters.slice(0, maximum - 1).join("").trimEnd()}…`;
}

try {
  const [releasesRaw, commitsRaw] = await Promise.all([
    fetchJson(`https://api.github.com/repos/${REPO}/releases?per_page=3`),
    fetchJson(`https://api.github.com/repos/${REPO}/commits?per_page=5`),
  ]);
  const releases = releasesRaw.map((release) => ({
    tag: release.tag_name || "",
    name: release.name || "",
    date: (release.published_at || "").slice(0, 10),
    body: truncate(release.body || "", 140),
    url: release.html_url || "",
  }));
  const commits = commitsRaw.map((entry) => ({
    sha: (entry.sha || "").slice(0, 7),
    message: truncate((entry.commit?.message || "").split("\n")[0], 80),
    author: entry.commit?.author?.name || "",
    date: (entry.commit?.author?.date || "").slice(0, 10),
    url: entry.html_url || "",
  }));
  const data = { releases, commits };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${jsonWithAsciiEscapes(data)}\n`, "utf8");
  console.log(`wrote ${relative(REPO_ROOT, OUT).split(sep).join("/")} (${statSync(OUT).size} bytes)`);
  console.log(`  releases: ${releases.length}, commits: ${commits.length}`);
} catch (error) {
  console.error(`error: failed to fetch GitHub data: ${error.message}`);
  process.exitCode = 1;
}
