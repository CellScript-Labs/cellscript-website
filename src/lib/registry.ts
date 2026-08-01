import registryDataJson from "../data/registry-packages.json";

export interface RegistryVersion {
  version: string;
  tag: string;
  source_hash: string;
  cellscript_version: string;
  /** Long-lived source-semantics epoch. */
  edition: "2026";
  /** Resolved target/assurance/ABI/schema profile identity. */
  compatibility_profile_hash: string;
  dependencies: Record<string, { namespace: string; version: string }>;
  status:
    | "source_published"
    | "indexed_pending"
    | "verified_build"
    | "deployed"
    | "on_chain_attested"
    | "deprecated"
    | "yanked"
    | "quarantined";
  yanked: boolean;
  license?: string;
  released_at?: string;
  yanked_at?: string;
  yanked_reason?: string;
  replaced_by?: string;
  abi_index?: string;
  schema_hash?: string;
}

export interface RegistryDeployment {
  name?: string;
  status?: string;
  network?: string;
  chain_id?: string;
  out_point?: string;
  code_hash?: string;
  data_hash?: string;
  tx_hash?: string;
  compiler_version?: string;
  artifact_hash?: string;
  metadata_hash?: string;
  schema_hash?: string;
  abi_hash?: string;
  constraints_hash?: string;
}

export interface RegistryEvidence {
  version: string;
  kind: string;
  evidence_hash?: string;
  producer?: string;
  generated_at?: string;
  network?: string;
  code_hash?: string;
  out_point?: string;
}

export interface RegistryPackageView {
  coordinate: string;
  namespace: string;
  name: string;
  description?: string;
  repository?: string;
  homepage?: string;
  documentation?: string;
  package_path?: string;
  package_dir_url?: string;
  registry_json_url?: string;
  source_snapshot_url?: string;
  license?: string;
  production: boolean;
  latest_version?: string;
  status: string;
  versions: RegistryVersion[];
  deployments: RegistryDeployment[];
  evidence: RegistryEvidence[];
  install_command: string;
  verify_command: string;
}

export interface RegistryPackage {
  coordinate: string;
  namespace: string;
  name: string;
  path: string;
  registry_path: string;
  source_revision?: string | null;
  description?: string;
  license?: string;
  repository?: string;
  homepage?: string;
  documentation?: string;
  keywords?: string[];
  categories?: string[];
  production?: boolean;
  metadata?: Record<string, unknown>;
  latest_version?: string;
  latest?: RegistryVersion | null;
  versions: RegistryVersion[];
  deployment: {
    count: number;
    active_count: number;
    networks: string[];
    active: RegistryDeployment[];
  };
  status: string;
  install_command: string;
  package_command_prefix: string;
  verify_command: string;
  publish_command: string;
  publish_dry_run_command: string;
  edit_command: string;
}

export interface RegistryData {
  schema_version: 1;
  source: string;
  packages: RegistryPackage[];
}

export const registryData = registryDataJson as RegistryData;
export const registryPackages = registryData.packages;

export const registryStats = {
  packages: registryPackages.length,
  namespaces: new Set(registryPackages.map((pkg) => pkg.namespace)).size,
  activeDeployments: registryPackages.reduce((count, pkg) => count + pkg.deployment.active_count, 0),
  productionPackages: registryPackages.filter((pkg) => pkg.production).length,
};

export interface RegistrySection {
  href: string;
  label: string;
  i18nKey: string;
}

export const registrySections: RegistrySection[] = [
  { href: "/registry", label: "Registry", i18nKey: "registry.nav.browse" },
  { href: "/registry/submit", label: "Submit", i18nKey: "registry.nav.submit" },
];

export function packageHref(pkg: RegistryPackage): string {
  return `/registry/package/${encodeURIComponent(pkg.namespace)}/${encodeURIComponent(pkg.name)}`;
}

export function findPackage(namespace: string, name: string): RegistryPackage | undefined {
  return registryPackages.find((pkg) => pkg.namespace === namespace && pkg.name === name);
}

export function shortHash(value?: string, visible = 12): string {
  if (!value) return "not recorded";
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  if (clean.length <= visible * 2) return value;
  return `${value.startsWith("0x") ? "0x" : ""}${clean.slice(0, visible)}...${clean.slice(-visible)}`;
}

export function registryStatusTone(status?: string): "active" | "info" | "warning" | "danger" | "source" {
  switch (status) {
    case "active":
    case "deployed":
    case "on_chain_attested":
      return "active";
    case "verified_build":
      return "info";
    case "indexed_pending":
    case "deprecated":
      return "warning";
    case "yanked":
    case "quarantined":
      return "danger";
    default:
      return "source";
  }
}

export function toRegistryPackageView(pkg: RegistryPackage): RegistryPackageView {
  const repositoryRoot = "https://github.com/CellScript-Labs/CellScript/tree/main";
  return {
    coordinate: pkg.coordinate,
    namespace: pkg.namespace,
    name: pkg.name,
    description: pkg.description,
    repository: pkg.repository,
    homepage: pkg.homepage,
    documentation: pkg.documentation,
    package_path: pkg.path,
    package_dir_url: `${repositoryRoot}/${pkg.path}`,
    registry_json_url: `${repositoryRoot}/${pkg.registry_path}`,
    license: pkg.license,
    production: Boolean(pkg.production),
    latest_version: pkg.latest_version,
    status: pkg.status,
    versions: pkg.versions,
    deployments: pkg.deployment.active,
    evidence: [],
    install_command: pkg.install_command || `cellc install ${pkg.coordinate}@${pkg.latest_version ?? "<version>"}`,
    verify_command: "cellc registry verify --live --json",
  };
}

export function packageSearchText(pkg: RegistryPackage): string {
  return [
    pkg.coordinate,
    pkg.description,
    pkg.latest_version,
    pkg.status,
    pkg.license,
    pkg.path,
    pkg.repository,
    ...(pkg.keywords ?? []),
    ...(pkg.categories ?? []),
    ...pkg.deployment.networks,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
