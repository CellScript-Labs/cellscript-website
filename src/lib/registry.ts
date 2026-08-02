import registryDataJson from "../data/registry-packages.json";

export interface RegistryVersion {
  version: string;
  tag: string;
  source_hash: string;
  cellscript_version?: string;
  /** Long-lived source-semantics epoch. */
  edition?: "2026";
  /** Resolved target/assurance/ABI/schema profile identity. */
  compatibility_profile_hash?: string;
  dependencies?: Record<string, { namespace: string; version: string }>;
  status:
    | "source_published"
    | "indexed_pending"
    | "verified_build"
    | "deployed"
    | "on_chain_committed"
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

export type RegistryArtifactKind =
  | "source_library"
  | "profile_library"
  | "runtime_verifier"
  | "deployable_contract"
  | "reproducible_binary"
  | "template";

export interface RegistryArtifactDescriptor {
  kind: RegistryArtifactKind;
  profile: "cellscript_source" | "ckb_executable" | "reproducible_build" | "copy_material";
  consumption_mode: "dependency" | "tcb" | "deployment" | "copy";
  language: "cellscript" | "rust" | "c" | "javascript" | "other" | "unspecified";
}

export interface RegistryRelease {
  release: string;
  source_hash: string;
  manifest_hash?: string;
  artifact_hash?: string;
  abi_hash?: string;
  build_recipe_hash?: string;
  profile_contract?: Record<string, any>;
  verification_status: "pending" | "hash_bound" | "verified" | "evidence_required" | "rejected";
  deployment_status: "not_applicable" | "undeployed" | "deployed" | "chain_verified";
  availability_status: "active" | "deprecated" | "yanked" | "quarantined";
  immutable_bundle?: { url?: string; content_type?: string; size_bytes?: number };
  direct_url?: string;
  created_at?: string;
  evidence?: RegistryEvidence[];
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
  version?: string;
  kind: string;
  evidence_hash?: string;
  producer?: string;
  generated_at?: string;
  network?: string;
  code_hash?: string;
  data_hash?: string;
  hash_type?: string;
  dep_type?: string;
  out_point?: string | { tx_hash: string; index: number };
  chain_verification?: string;
  evidence?: Record<string, unknown>;
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
  latest_release?: string;
  artifact: RegistryArtifactDescriptor;
  verification_status: RegistryRelease["verification_status"];
  deployment_status: RegistryRelease["deployment_status"];
  availability_status: RegistryRelease["availability_status"];
  releases: RegistryRelease[];
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
  { href: "/registry/api", label: "API", i18nKey: "registry.nav.api" },
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
    case "on_chain_committed":
    case "chain_verified":
    case "verified":
      return "active";
    case "hash_bound":
    case "verified_build":
    case "evidence_required":
      return "info";
    case "indexed_pending":
    case "pending":
    case "undeployed":
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
  const verificationStatus: RegistryRelease["verification_status"] = ["verified_build", "deployed", "on_chain_committed"].includes(pkg.status)
    ? "verified"
    : "pending";
  const deploymentStatus: RegistryRelease["deployment_status"] = pkg.status === "on_chain_committed"
    ? "chain_verified"
    : pkg.status === "deployed"
      ? "deployed"
      : "not_applicable";
  const availabilityStatus: RegistryRelease["availability_status"] = ["deprecated", "yanked", "quarantined"].includes(pkg.status)
    ? pkg.status as RegistryRelease["availability_status"]
    : "active";
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
    latest_release: pkg.latest_version,
    artifact: {
      kind: "source_library",
      profile: "cellscript_source",
      consumption_mode: "dependency",
      language: "cellscript",
    },
    verification_status: verificationStatus,
    deployment_status: deploymentStatus,
    availability_status: availabilityStatus,
    releases: pkg.versions.map((version) => ({
      release: version.version,
      source_hash: version.source_hash,
      verification_status: ["verified_build", "deployed", "on_chain_committed"].includes(version.status) ? "verified" : "pending",
      deployment_status: version.status === "on_chain_committed" ? "chain_verified" : version.status === "deployed" ? "deployed" : "not_applicable",
      availability_status: ["deprecated", "yanked", "quarantined"].includes(version.status)
        ? version.status as RegistryRelease["availability_status"]
        : "active",
      created_at: version.released_at,
    })),
    deployments: pkg.deployment.active,
    evidence: [],
    install_command: pkg.install_command || `cellc install ${pkg.coordinate}@${pkg.latest_version ?? "<release>"}`,
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
