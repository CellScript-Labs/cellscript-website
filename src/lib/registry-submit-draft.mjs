const DRAFT_SCHEMA = "cellscript-registry-submit-draft-v1";
const DRAFT_PREFIX = "cellscript-registry-submit-draft-v1:";

const fieldNames = [
  "artifact_kind",
  "artifact_language",
  "namespace",
  "name",
  "path",
  "artifact_release",
  "build_target",
  "toolchain",
  "source_revision",
  "build_reproducible",
  "security_status",
  "script_role",
  "vm_version",
  "hash_type",
  "dep_type",
  "verifier_id",
  "ipc_abi",
  "template_entrypoint",
];

const safeString = (value) => typeof value === "string" ? value.slice(0, 4096) : "";

export const registrySubmitDraftKey = (environment, network) =>
  `${DRAFT_PREFIX}${safeString(environment) || "production"}:${safeString(network) || "mainnet"}`;

export function readRegistrySubmitDraft(storage, key) {
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "null");
    if (!parsed || parsed.schema !== DRAFT_SCHEMA || typeof parsed.fields !== "object") return null;
    const fields = {};
    for (const name of fieldNames) fields[name] = safeString(parsed.fields[name]);
    return {
      fields,
      manualOpen: parsed.manualOpen === true,
      profileOpen: parsed.profileOpen === true,
      authorisationMode: parsed.authorisationMode === "new" || parsed.authorisationMode === "existing"
        ? parsed.authorisationMode
        : null,
    };
  } catch {
    return null;
  }
}

export function writeRegistrySubmitDraft(storage, key, draft) {
  const fields = {};
  for (const name of fieldNames) fields[name] = safeString(draft?.fields?.[name]);
  try {
    storage.setItem(key, JSON.stringify({
      schema: DRAFT_SCHEMA,
      fields,
      manualOpen: draft?.manualOpen === true,
      profileOpen: draft?.profileOpen === true,
      authorisationMode: draft?.authorisationMode === "new" || draft?.authorisationMode === "existing"
        ? draft.authorisationMode
        : null,
    }));
  } catch {
    // The form remains usable when storage is disabled or full.
  }
}

export function clearRegistrySubmitDraft(storage, key) {
  try { storage.removeItem(key); }
  catch { /* There is no persisted draft to clear when storage is unavailable. */ }
}

export const registrySubmitDraftFieldNames = Object.freeze([...fieldNames]);
