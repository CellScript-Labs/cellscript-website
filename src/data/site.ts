import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// In the main CellScript checkout, site.ts lives at website/src/data/site.ts and
// reaches the repo root with ../../.. . Standalone website builds can provide
// CELLSCRIPT_REPO_ROOT instead.
const here = dirname(fileURLToPath(import.meta.url));
const repoRootCandidates = [
  process.env.CELLSCRIPT_REPO_ROOT,
  resolve(process.cwd(), ".."),
  process.cwd(),
  resolve(here, "..", "..", ".."),
].filter((candidate): candidate is string => Boolean(candidate));
const repoRoot =
  repoRootCandidates.find((candidate) => existsSync(resolve(candidate, "examples"))) ??
  repoRootCandidates[0];

export const links = {
  docs: "/docs/",
  discussion: "https://talk.nervos.org/t/cellscript-a-dsl-for-cell-based-contracts/10193/9",
  examples: "https://github.com/CellScript-Labs/CellScript/tree/main/examples",
  source: "https://github.com/CellScript-Labs/CellScript",
  wiki: "https://github.com/CellScript-Labs/CellScript/wiki",
};

export const playgroundExamples = [
  { id: "token", label: "Fungible token", file: "examples/token.cell" },
  { id: "nft", label: "NFT collection", file: "examples/nft.cell" },
  { id: "amm", label: "AMM pool", file: "examples/amm_pool.cell" },
  { id: "vesting", label: "Vesting flow", file: "examples/vesting.cell" },
  { id: "launch", label: "Token launch", file: "examples/launch.cell" },
  { id: "multisig", label: "Multisig wallet", file: "examples/multisig.cell" },
  { id: "timelock", label: "Timelock escrow", file: "examples/timelock.cell" },
  { id: "canonicalStyle", label: "Canonical style", file: "examples/language/core/canonical_style.cell" },
  { id: "orderBook", label: "Order book", file: "examples/language/collections/order_book.cell" },
  { id: "languageRegistry", label: "Language registry", file: "examples/language/collections/registry.cell" },
  { id: "stdlib", label: "Stdlib constraints", file: "examples/language/core/stdlib.cell" },
  { id: "ckbTypeIdCreate", label: "CKB TYPE_ID create", file: "examples/language/ckb/type_id_create.cell" },
  { id: "delegateVerify", label: "Delegate verify", file: "examples/language/ckb/delegate_verify.cell" },
  { id: "blake2bHash", label: "Blake2b hash lock", file: "examples/language/ckb/blake2b_hash.cell" },
  { id: "multiStepPipeline", label: "Pipe cleanup", file: "examples/language/ckb/multi_step_pipeline.cell" },
  { id: "witnessSource", label: "Witness source", file: "examples/language/ckb/witness_source.cell" },
  { id: "identityLifecycle", label: "Identity lifecycle", file: "examples/language/ownership/identity_lifecycle.cell" },
  { id: "scopedInvariant", label: "Scoped invariants", file: "examples/language/verification/scoped_invariant.cell" },
] as const;

const playgroundSourceNotes: Record<string, readonly string[]> = {
  token: [
    "Start here: this example shows the Cell lifecycle for a simple token.",
    "Follow the consume/create/destroy lines; they are the core of CellScript.",
  ],
  nft: [
    "Shows a larger asset model: collection state, NFT ownership, sale receipts, and royalties.",
    "Use it after the token example; there are more moving parts.",
  ],
  amm: [
    "Shows shared pool state and receipts for liquidity providers.",
    "The important checks are reserve updates, fee bounds, and slippage protection.",
  ],
  vesting: [
    "Shows time-based state: grants move through a small flow before tokens can be claimed.",
    "Look for env::current_timepoint and the transition line.",
  ],
  launch: [
    "Shows a launch transaction that creates several outputs at once.",
    "The checks keep allocation totals, pool seed amount, and change output consistent.",
  ],
  multisig: [
    "Shows receipt-style workflow around proposals, signatures, and execution records.",
    "This is a larger example; focus first on create_wallet and propose_transfer.",
  ],
  timelock: [
    "Shows absolute and relative lock timing.",
    "The useful idea is that unlock conditions are explicit checks, not hidden wallet logic.",
  ],
  canonicalStyle: [
    "Shows the recommended shape for source reads, witness data, and lock args.",
    "The comments in the lock explain what is real authority and what is only decoded data.",
  ],
  orderBook: [
    "Small local-data exercise for Vec operations and order matching.",
    "It is not a full exchange; it teaches list operations inside verifier code.",
  ],
  languageRegistry: [
    "Small local registry exercise for Vec insert, remove, set, truncate, and reverse.",
    "Useful for learning collection operations without a full protocol around them.",
  ],
  stdlib: [
    "Shows compiler-recognised std:: helpers that expand to ordinary verifier checks.",
    "Use this when you want to see how preserve, transfer, claim, and settle are written.",
  ],
  ckbTypeIdCreate: [
    "Shows TYPE_ID-style identity at the boundary between source, metadata, and builder evidence.",
    "The source declares intent; deployment still needs builder-side evidence.",
  ],
  delegateVerify: [
    "Advanced: shows bounded verifier reuse through spawn/wait.",
    "Read it as a CKB runtime boundary example, not as a beginner contract.",
  ],
  blake2bHash: [
    "Small lock example for hashing witness data and comparing the result.",
    "Good for seeing how a lock returns true only after explicit checks pass.",
  ],
  multiStepPipeline: [
    "Creates a pipe, closes both endpoints, and checks each close status; no child or data transfer is implied.",
    "Use the separate delegation and bounded byte-context examples for actual child transport.",
  ],
  witnessSource: [
    "Shows how protected Cells, lock args, witness data, and sighash relate.",
    "Names like claimed_owner are not authority by themselves; the checks make them meaningful.",
  ],
  identityLifecycle: [
    "Shows unique Cell identity policies such as TYPE_ID, field identity, and script args.",
    "Use it to learn create_unique, replace_unique, and policy-specific destruction.",
  ],
  scopedInvariant: [
    "Shows aggregate invariants such as sum conservation and uniqueness.",
    "These are review obligations: inspect the metadata before relying on them.",
  ],
};

const annotateForPlayground = (id: string, source: string): string => {
  const notes = playgroundSourceNotes[id];
  if (!notes?.length) return source;
  return [
    "// Playground teaching note:",
    ...notes.map((note) => `// ${note}`),
    "",
    source,
  ].join("\n");
};

const readExampleSource = (id: string, file: string): string =>
  annotateForPlayground(id, readFileSync(resolve(repoRoot, file), "utf-8"));

/**
 * Full compilable source for each playground example, read from examples/
 * at build time. The heroExamples array below still uses short display
 * snippets for the landing page.
 */
export const exampleFullSources = Object.fromEntries(
  playgroundExamples.map((example) => [example.id, readExampleSource(example.id, example.file)]),
) as Record<string, string>;

// Every example keeps its original module/import identity. Dependencies are
// real source files, not copies of type declarations rewritten into the entry.
const exampleDependencies: Record<string, readonly string[]> = {
  nft: ["examples/token.cell"],
  amm: ["examples/token.cell"],
  vesting: ["examples/token.cell"],
  launch: ["examples/token.cell", "examples/amm_pool.cell"],
  timelock: ["examples/token.cell"],
};

export const exampleWorkspaces = Object.fromEntries(playgroundExamples.map((example) => [
  example.id,
  [
    { path: example.file, source: exampleFullSources[example.id], role: "entry" as const },
    ...(exampleDependencies[example.id] ?? []).map((path) => ({
      path, source: readFileSync(resolve(repoRoot, path), "utf-8"), role: "memory" as const,
    })),
  ],
]));

// Landing-page previews are excerpts of the same current sources as the
// playground. Omitted lines are labelled; no second hand-written grammar.
export const heroExamples = [playgroundExamples[0], playgroundExamples[1], playgroundExamples[2], playgroundExamples[3]].map((example) => ({
  id: example.id,
  file: example.file.split("/").at(-1)!,
  command: `cellc metadata ${example.file} --target-profile ckb --json`,
  lines: [...readFileSync(resolve(repoRoot, example.file), "utf-8").trimEnd().split("\n").slice(0, 38),
    "// ... remaining source is available in the playground"],
}));

export const modelCards = [
  {
    id: "resource",
    name: "resource",
    source: "examples/token.cell",
    code: "// examples/token.cell\nresource Token has store, create, consume, replace, burn, relock {\n    amount: u64,\n    symbol: [u8; 8],\n}",
  },
  {
    id: "shared",
    name: "shared",
    source: "examples/amm_pool.cell",
    code: "// examples/amm_pool.cell\nshared Pool has store, create, replace {\n    token_a_symbol: [u8; 8],\n    token_b_symbol: [u8; 8],\n    // ... reserves, LP supply, fee rate omitted\n}",
  },
  {
    id: "receipt",
    name: "receipt",
    source: "examples/nft.cell",
    code: "// examples/nft.cell\nreceipt Listing has create, consume, burn {\n    token_id: u64,\n    seller: Address,\n    price: u64,\n    // ... created_at and state omitted\n}",
  },
  {
    id: "action",
    name: "action",
    source: "examples/vesting.cell",
    code: "// examples/vesting.cell\naction claim_vested(grant: VestingGrant) -> (tokens: Token, updated_grant: VestingGrant) {\n        // ... timepoint checks and vesting arithmetic omitted\n        consume grant;\n        create updated_grant = VestingGrant { state: VestingState::Active, /* ... */ } with_lock(grant.beneficiary)\n}",
  },
  {
    id: "lock",
    name: "lock",
    source: "examples/language/core/canonical_style.cell",
    code: "// examples/language/core/canonical_style.cell\nlock vault_owner(protected vault: Vault, lock_args owner: Address, witness claimed_owner: Address) -> bool {\n    let input = source::group_input(0);\n    let witness_lock = witness::lock_exact32(input);\n    // ... digest and ownership checks omitted\n}",
  },
  {
    id: "flow",
    name: "flow",
    source: "examples/vesting.cell",
    code: "// examples/vesting.cell\nflow VestingGrant.state {\n    initial Active;\n    terminal FullyClaimed;\n    Active -> Active;\n    Active -> FullyClaimed;\n}",
  },
  {
    id: "invariant",
    name: "invariant",
    source: "examples/language/verification/scoped_invariant.cell",
    code: "// examples/language/verification/scoped_invariant.cell\ninvariant token_amount_conservation {\n    trigger: type_group;\n    scope: group;\n    reads: group_inputs<Token>.amount, group_outputs<Token>.amount;\n    assert_sum(group_outputs<Token>.amount) == assert_sum(group_inputs<Token>.amount);\n}",
  },
  {
    id: "structEnum",
    name: "struct / enum",
    source: "examples/nft.cell",
    code: "// examples/nft.cell\nstruct Metadata {\n    name: String,\n    description: String,\n    image_uri: String,\n    attributes: Vec<(String, String)>,\n}",
  },
  {
    id: "identity",
    name: "identity",
    source: "examples/language/ownership/identity_lifecycle.cell",
    code: "// examples/language/ownership/identity_lifecycle.cell\naction mint_unique_nft(recipient: Address, tid: u64) -> UniqueNFT {\n    create_unique::<UniqueNFT>(identity = field(token_id)) { token_id: tid, owner: recipient } with_lock(recipient)\n}",
  },
] as const;

export const tools = [
  {
    id: "metadata",
    name: "metadata",
    command: "cellc metadata examples/vesting.cell --target-profile ckb --json",
  },
  {
    id: "constraints",
    name: "constraints",
    command: "cellc constraints examples/vesting.cell --target-profile ckb",
  },
  {
    id: "auditBundle",
    name: "audit-bundle",
    command: "cellc audit-bundle examples/token.cell --target-profile ckb --out audit/",
  },
  {
    id: "lsp",
    name: "lsp",
    command: "cellc lsp",
  },
] as const;

export const exampleGroups = [
  {
    id: "protocols",
    items: [
      { path: "examples/token.cell", id: "token", tags: ["resource", "invariant", "burn"] },
      { path: "examples/nft.cell", id: "nft", tags: ["resource", "receipt", "preserve"] },
      { path: "examples/amm_pool.cell", id: "ammPool", tags: ["shared", "receipt", "slippage"] },
      { path: "examples/vesting.cell", id: "vesting", tags: ["flow", "receipt", "env"] },
      { path: "examples/launch.cell", id: "launch", tags: ["flow", "settle", "claim"] },
      { path: "examples/registry.cell", id: "registry", tags: ["resource", "identity", "replace"] },
    ],
  },
  {
    id: "primitives",
    items: [
      { path: "examples/multisig.cell", id: "multisig", tags: ["lock", "witness", "threshold"] },
      { path: "examples/timelock.cell", id: "timelock", tags: ["lock", "env", "timepoint"] },
      { path: "examples/language/core/canonical_style.cell", id: "canonicalStyle", tags: ["protected", "witness", "sighash"] },
      { path: "examples/language/ckb/capacity_time.cell", id: "capacityTime", tags: ["capacity", "env", "time"] },
      { path: "examples/language/ckb/witness_source.cell", id: "witnessSource", tags: ["source", "witness", "boundary"] },
      { path: "examples/language/ckb/delegate_verify.cell", id: "delegateVerify", tags: ["delegate", "verify", "lock"] },
    ],
  },
  {
    id: "language",
    items: [
      { path: "examples/language/ownership/identity_lifecycle.cell", id: "identityLifecycle", tags: ["identity", "unique", "lifecycle"] },
      { path: "examples/language/verification/scoped_invariant.cell", id: "scopedInvariant", tags: ["invariant", "assert_sum", "scope"] },
      { path: "examples/language/collections/order_book.cell", id: "orderBook", tags: ["orders", "matching", "state"] },
      { path: "examples/language/collections/registry.cell", id: "languageRegistry", tags: ["registry", "fields", "replace"] },
      { path: "examples/language/ckb/blake2b_hash.cell", id: "blake2bHash", tags: ["hash", "blake2b", "stdlib"] },
      { path: "examples/ickb_benchmark/ickb_logic.cell", id: "ickbLogic", tags: ["benchmark", "receipt", "logic"] },
    ],
  },
] as const;

export const workflowSteps = [
  { id: "source", icon: "source" },
  { id: "parse", icon: "parse" },
  { id: "metadata", icon: "metadata" },
  { id: "riscv", icon: "riscv" },
  { id: "elf", icon: "elf" },
] as const;
