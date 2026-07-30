#!/usr/bin/env node
/** Generate website registry data from real CellScript package metadata. */

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse as parseToml } from "smol-toml";
import { jsonWithAsciiEscapes } from "./ascii-json.mjs";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(WEBSITE_ROOT, "src/data/registry-packages.json");
const SKIP_DIRS = new Set([".git", ".astro", ".cell", "dist", "node_modules", "target"]);

function registryRoot() {
  const configured = process.env.CELLSCRIPT_REGISTRY_ROOT;
  if (configured) {
    const expanded = configured === "~" || configured.startsWith(`~${sep}`)
      ? resolve(homedir(), configured.slice(2))
      : configured;
    return realpathSync(resolve(expanded));
  }
  const parent = resolve(WEBSITE_ROOT, "..");
  if (existsSync(resolve(parent, ".gitmodules")) && existsSync(resolve(parent, "Cargo.toml"))) {
    return parent;
  }
  return WEBSITE_ROOT;
}

const REPO_ROOT = registryRoot();

function posixRelative(from, to) {
  return relative(from, to).split(sep).join("/");
}

function isSkipped(candidate) {
  return posixRelative(REPO_ROOT, candidate).split("/").some((part) => SKIP_DIRS.has(part));
}

function readJson(candidate) {
  return JSON.parse(readFileSync(candidate, "utf8"));
}

function readToml(candidate) {
  return existsSync(candidate) ? parseToml(readFileSync(candidate, "utf8")) : {};
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return result.status === 0 ? result.stdout.trim() : "";
}

function gitRevision(candidate) {
  const root = git(["-C", dirname(candidate), "rev-parse", "--show-toplevel"], REPO_ROOT);
  if (!root) return null;
  const revision = git(["rev-parse", "HEAD"], root);
  if (revision) return revision;
  const rel = posixRelative(realpathSync(root), realpathSync(candidate));
  const logged = git(["log", "-1", "--no-merges", "--format=%H", "--", rel], root);
  if (logged) return logged;
  const mergeHeads = git(["rev-parse", "-q", "--verify", "MERGE_HEAD"], root).split("\n").filter(Boolean);
  for (const head of mergeHeads) {
    const merged = git(["log", "-1", "--no-merges", "--format=%H", head, "--", rel], root);
    if (merged) return merged;
  }
  return null;
}

function latestVersion(versions) {
  const active = versions.filter((version) => !version.yanked);
  const candidates = active.length ? active : versions;
  return candidates.length
    ? [...candidates].sort((left, right) => String(left.released_at || left.version || "").localeCompare(String(right.released_at || right.version || ""))).at(-1)
    : null;
}

function deploymentSummary(deployed) {
  const deployments = Array.isArray(deployed.deployments) ? deployed.deployments : [];
  const active = deployments.filter((item) => item.status === "active");
  const networks = [...new Set(deployments.map((item) => item.network).filter(Boolean).map(String))].sort();
  return { count: deployments.length, active_count: active.length, networks, active };
}

function packageRecord(registryPath) {
  const registry = readJson(registryPath);
  if (!Array.isArray(registry.versions)) return null;
  const packageDir = dirname(registryPath);
  const manifest = readToml(resolve(packageDir, "Cell.toml"));
  const deployed = readToml(resolve(packageDir, "Deployed.toml"));
  const packageManifest = manifest.package && typeof manifest.package === "object" && !Array.isArray(manifest.package) ? manifest.package : {};
  const policy = manifest.policy && typeof manifest.policy === "object" && !Array.isArray(manifest.policy) ? manifest.policy : {};
  const metadata = manifest.metadata && typeof manifest.metadata === "object" && !Array.isArray(manifest.metadata) ? manifest.metadata : {};
  const latest = latestVersion(registry.versions);
  const namespace = String(registry.namespace || packageManifest.namespace || "");
  const name = String(registry.name || packageManifest.name || "");
  if (!namespace || !name) return null;
  const deployment = deploymentSummary(deployed);
  const latestValue = String(latest?.version || packageManifest.version || "");
  const status = deployment.active_count ? "active" : String(metadata.status || "source-only");
  const packagePath = posixRelative(REPO_ROOT, packageDir);
  return {
    coordinate: `${namespace}/${name}`,
    namespace,
    name,
    path: packagePath,
    registry_path: posixRelative(REPO_ROOT, registryPath),
    source_revision: gitRevision(registryPath),
    description: packageManifest.description || "",
    license: latest?.license || packageManifest.license || "",
    repository: packageManifest.repository || "",
    homepage: packageManifest.homepage || "",
    documentation: packageManifest.documentation || "",
    keywords: packageManifest.keywords || [],
    categories: packageManifest.categories || [],
    production: Boolean(policy.production || false),
    policy,
    metadata,
    latest_version: latestValue,
    latest,
    versions: registry.versions,
    deployment,
    status,
    install_command: latestValue ? `cellc install ${namespace}/${name}@${latestValue}` : `cellc install ${namespace}/${name}`,
    package_command_prefix: `cd ${packagePath}`,
    verify_command: `cd ${packagePath} && cellc registry verify --live --json`,
    publish_command: `cd ${packagePath} && cellc publish`,
    publish_dry_run_command: `cd ${packagePath} && cellc publish --dry-run`,
    edit_command: `cd ${packagePath} && cellc registry edit`,
  };
}

async function findRegistryFiles(start) {
  const found = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const candidate = resolve(directory, entry.name);
      if (isSkipped(candidate)) continue;
      if (entry.isDirectory()) await visit(candidate);
      else if (entry.isFile() && entry.name === "registry.json") found.push(candidate);
    }
  }
  await visit(start);
  return found.sort();
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  }
  return value;
}

const registryPaths = await findRegistryFiles(REPO_ROOT);
if (!registryPaths.length && existsSync(OUT)) {
  console.log(`no registry.json sources found under ${REPO_ROOT}; keeping committed ${posixRelative(WEBSITE_ROOT, OUT)}`);
  process.exit(0);
}
const records = registryPaths.map(packageRecord).filter(Boolean).sort((left, right) => left.coordinate.localeCompare(right.coordinate));
const payload = { schema_version: 1, source: "repo registry.json + Cell.toml + Deployed.toml scan", packages: records };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${jsonWithAsciiEscapes(sortJson(payload))}\n`, "utf8");
console.log(`generated ${posixRelative(REPO_ROOT, OUT)} with ${records.length} package(s)`);
