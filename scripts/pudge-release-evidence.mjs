#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ccc } from "@ckb-ccc/core";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const MANIFEST_SCHEMA = "cellscript-pudge-release-deployment-manifest-v1";
const BATCH_SCHEMA = "cellscript-pudge-release-deployment-batch-v1";
const RELEASE_SCHEMA = "cellscript-pudge-release-deployment-v1";
const WALLET_SCHEMA = "cellscript-pudge-deployment-wallet-v1";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      fail(`expected --name value arguments, found ${flag ?? "end of arguments"}`);
    }
    const key = flag.slice(2);
    const current = values.get(key) ?? [];
    current.push(value);
    values.set(key, current);
  }
  return { command, values };
}

function one(args, name, { required = true } = {}) {
  const values = args.values.get(name) ?? [];
  if (values.length > 1) fail(`--${name} may be supplied only once`);
  if (required && values.length !== 1) fail(`missing --${name}`);
  return values[0];
}

function many(args, name) {
  return args.values.get(name) ?? [];
}

async function loadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function requireHex(value, bytes, label) {
  if (typeof value !== "string" || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)) {
    fail(`${label} must be canonical lowercase 0x-prefixed ${bytes}-byte hex`);
  }
}

function requireSha256(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) fail(`${label} must be canonical lowercase SHA-256 hex`);
}

function normalizeLock(lock) {
  return { code_hash: lock.codeHash, hash_type: lock.hashType, args: lock.args };
}

function locksEqual(left, right) {
  return left.code_hash === right.code_hash && left.hash_type === right.hash_type && left.args === right.args;
}

function artifactSummary(artifact) {
  return {
    id: artifact.id,
    purpose: artifact.purpose,
    source: artifact.source,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    ckb_data_hash: artifact.ckb_data_hash,
  };
}

async function canonicalRoot(candidate) {
  const resolved = await realpath(candidate);
  const stat = await lstat(resolved);
  if (!stat.isDirectory()) fail(`root is not a directory: ${candidate}`);
  return resolved;
}

async function confinedFile(base, relative, label) {
  if (typeof relative !== "string" || path.isAbsolute(relative) || relative.includes("\\")) {
    fail(`${label} must be a normalized relative path`);
  }
  const pieces = relative.split("/");
  if (pieces.some((piece) => piece === "" || piece === "." || piece === "..")) fail(`${label} is not normalized`);
  const baseReal = await realpath(base);
  const joined = path.join(baseReal, relative);
  const stat = await lstat(joined);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular non-symlink file`);
  const resolved = await realpath(joined);
  if (resolved !== baseReal && !resolved.startsWith(`${baseReal}${path.sep}`)) fail(`${label} escapes its source root`);
  return resolved;
}

async function validateManifest(root, manifestFile, acceptanceReportFile) {
  const manifest = await loadJson(manifestFile);
  if (manifest.schema !== MANIFEST_SCHEMA || manifest.release_line !== "0.30") fail(`invalid Pudge deployment manifest identity`);
  if (manifest.status !== "accepted-deployment-scope") fail(`Pudge deployment scope must be explicitly accepted`);
  requireHex(manifest.network?.genesis_hash, 32, "network.genesis_hash");
  if (manifest.network?.chain_id !== "ckb_testnet" || manifest.network?.name !== "pudge") fail(`manifest must select Pudge testnet`);
  if (!/^https:\/\//.test(manifest.network?.rpc_url ?? "")) fail(`manifest RPC must use HTTPS`);
  requireHex(`0x${manifest.artifact_source_commit ?? ""}`, 20, "artifact_source_commit");
  if (!Number.isSafeInteger(manifest.required_confirmations) || manifest.required_confirmations < 1) {
    fail(`required_confirmations must be a positive safe integer`);
  }
  if (!Number.isSafeInteger(manifest.fee_rate_shannons_per_kb) || manifest.fee_rate_shannons_per_kb < 1000) {
    fail(`fee_rate_shannons_per_kb must be at least 1000`);
  }
  if (!Array.isArray(manifest.batches) || manifest.batches.length < 1) fail(`manifest must contain deployment batches`);

  const acceptance = await loadJson(acceptanceReportFile);
  if (acceptance.status !== "passed" || acceptance.production_ready !== true) fail(`acceptance report is not production-ready`);
  if (acceptance.source_provenance?.repo_commit !== manifest.artifact_source_commit) {
    fail(`acceptance report source commit does not match the deployment manifest`);
  }
  if (acceptance.source_provenance?.git_dirty !== false) fail(`acceptance report source must be clean`);
  const acceptanceRoot = path.dirname(await realpath(acceptanceReportFile));

  const batchIds = new Set();
  const artifactIds = new Set();
  const artifacts = [];
  for (const batch of manifest.batches) {
    if (!/^[a-z0-9-]+$/.test(batch.id ?? "") || batchIds.has(batch.id)) fail(`deployment batch IDs must be unique slugs`);
    batchIds.add(batch.id);
    if (typeof batch.purpose !== "string" || batch.purpose.trim() === "") fail(`batch ${batch.id} must state its purpose`);
    if (!Array.isArray(batch.artifacts) || batch.artifacts.length < 1) fail(`batch ${batch.id} must contain artifacts`);
    for (const artifact of batch.artifacts) {
      if (!/^[a-z0-9.-]+$/.test(artifact.id ?? "") || artifactIds.has(artifact.id)) fail(`artifact IDs must be unique slugs`);
      artifactIds.add(artifact.id);
      if (typeof artifact.purpose !== "string" || artifact.purpose.trim() === "") fail(`artifact ${artifact.id} must state its purpose`);
      if (!artifact.source || !["repository", "acceptance-report"].includes(artifact.source.kind)) {
        fail(`artifact ${artifact.id} has an invalid source kind`);
      }
      requireSha256(artifact.sha256, `artifact ${artifact.id} sha256`);
      requireHex(artifact.ckb_data_hash, 32, `artifact ${artifact.id} ckb_data_hash`);
      if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1) fail(`artifact ${artifact.id} has an invalid byte length`);
      const sourceRoot = artifact.source.kind === "repository" ? root : acceptanceRoot;
      const file = await confinedFile(sourceRoot, artifact.source.path, `artifact ${artifact.id} source`);
      const bytes = await readFile(file);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const ckbDataHash = ccc.hashCkb(bytes);
      if (bytes.length !== artifact.bytes || sha256 !== artifact.sha256 || ckbDataHash !== artifact.ckb_data_hash) {
        fail(`artifact ${artifact.id} bytes or hashes do not match the accepted manifest`);
      }
      artifacts.push({ ...artifact, batch: batch.id, file, data: bytes });
    }
  }
  return { manifest, acceptance, artifacts };
}

function configureProxy() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy) setGlobalDispatcher(new ProxyAgent(proxy));
}

async function connectNetwork(manifest) {
  configureProxy();
  const client = new ccc.ClientPublicTestnet({ url: manifest.network.rpc_url, timeout: 30_000 });
  const genesis = await client.getHeaderByNumber(0);
  if (genesis?.hash !== manifest.network.genesis_hash) {
    fail(`RPC genesis ${genesis?.hash ?? "missing"} does not match selected Pudge genesis ${manifest.network.genesis_hash}`);
  }
  const info = await client.requestor.request("get_blockchain_info", []);
  if (info?.chain !== "ckb_testnet") fail(`RPC chain identity is ${info?.chain ?? "missing"}, expected ckb_testnet`);
  return { client, info };
}

async function loadWallet(file, client) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`wallet must be a regular non-symlink file`);
  if ((stat.mode & 0o077) !== 0) fail(`wallet file must not be accessible by group or other users`);
  const wallet = await loadJson(file);
  if (wallet.schema !== WALLET_SCHEMA) fail(`wallet schema must be ${WALLET_SCHEMA}`);
  requireHex(wallet.private_key, 32, "wallet private_key");
  const signer = new ccc.SignerCkbPrivateKey(client, wallet.private_key);
  const address = await signer.getRecommendedAddress();
  if (address !== wallet.address) fail(`wallet address does not match its private key`);
  return { signer, address };
}

async function inputCapacity(client, transaction) {
  let total = 0n;
  for (const input of transaction.inputs) {
    const cell = input.cellOutput ? { cellOutput: input.cellOutput } : await client.getCell(input.previousOutput);
    if (!cell) fail(`cannot resolve deployment input ${input.previousOutput.txHash}:${input.previousOutput.index}`);
    total += cell.cellOutput.capacity;
  }
  return total;
}

async function verifyLiveArtifacts(client, ownerLock, txHash, artifacts) {
  const verified = [];
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index];
    const cell = await client.getCellLive({ txHash, index }, true, true);
    if (!cell) fail(`deployed artifact ${artifact.id} is not a live Cell at ${txHash}:${index}`);
    const data = ccc.bytesFrom(cell.outputData);
    const sha256 = createHash("sha256").update(data).digest("hex");
    const ckbDataHash = ccc.hashCkb(data);
    const liveLock = normalizeLock(cell.cellOutput.lock);
    if (data.length !== artifact.bytes || sha256 !== artifact.sha256 || ckbDataHash !== artifact.ckb_data_hash) {
      fail(`live Cell bytes do not match artifact ${artifact.id}`);
    }
    if (!locksEqual(liveLock, ownerLock)) fail(`live Cell lock does not match deployment authority for ${artifact.id}`);
    verified.push({
      ...artifactSummary(artifact),
      out_point: { tx_hash: txHash, index },
      capacity_shannons: cell.cellOutput.capacity.toString(),
      lock: liveLock,
      dep_type: "code",
      hash_type: "data2",
      live: true,
      bytes_match: true,
    });
  }
  return verified;
}

async function deployBatch(args) {
  const root = await canonicalRoot(one(args, "root"));
  const manifestFile = await confinedFile(root, one(args, "manifest"), "manifest");
  const acceptanceReportFile = await confinedFile(root, one(args, "acceptance-report"), "acceptance report");
  const batchId = one(args, "batch");
  const output = path.resolve(one(args, "output"));
  try {
    await lstat(output);
    fail(`refusing to overwrite existing deployment report: ${output}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const { manifest, artifacts: allArtifacts } = await validateManifest(root, manifestFile, acceptanceReportFile);
  const batch = manifest.batches.find((candidate) => candidate.id === batchId);
  if (!batch) fail(`unknown deployment batch ${batchId}`);
  const artifacts = allArtifacts.filter((artifact) => artifact.batch === batchId);
  const { client, info } = await connectNetwork(manifest);
  const { signer, address } = await loadWallet(path.resolve(one(args, "wallet")), client);
  const ownerLock = normalizeLock((await signer.getRecommendedAddressObj()).script);
  const balanceBefore = await signer.getBalance();
  const transaction = ccc.Transaction.from({});
  for (const artifact of artifacts) transaction.addOutput({ lock: (await signer.getRecommendedAddressObj()).script }, ccc.hexFrom(artifact.data));
  const addedInputs = await transaction.completeInputsByCapacity(signer);
  const feeCompletion = await transaction.completeFeeBy(signer, BigInt(manifest.fee_rate_shannons_per_kb));
  const signed = await signer.signTransaction(transaction);
  const inputTotal = await inputCapacity(client, signed);
  const outputTotal = signed.outputs.reduce((sum, outputCell) => sum + outputCell.capacity, 0n);
  const fee = inputTotal - outputTotal;
  if (fee <= 0n) fail(`deployment transaction fee must be positive`);
  const dryRunCycles = await client.sendTransactionDry(signed, "passthrough");
  const expectedHash = signed.hash();
  const txHash = await client.sendTransaction(signed, "passthrough");
  if (txHash !== expectedHash) fail(`node returned a deployment transaction hash different from the signed transaction`);
  const confirmed = await client.waitTransaction(txHash, manifest.required_confirmations, 1_200_000, 5_000);
  if (!confirmed || confirmed.status !== "committed" || confirmed.transaction?.hash() !== txHash) {
    fail(`deployment transaction did not reach committed status with the required confirmation depth`);
  }
  const verified = await verifyLiveArtifacts(client, ownerLock, txHash, artifacts);
  const tip = await client.getTip();
  const balanceAfter = await signer.getBalance();
  const report = {
    schema: BATCH_SCHEMA,
    status: "passed",
    release_line: manifest.release_line,
    artifact_source_commit: manifest.artifact_source_commit,
    batch: { id: batch.id, purpose: batch.purpose },
    network: {
      name: manifest.network.name,
      chain_id: info.chain,
      genesis_hash: manifest.network.genesis_hash,
      rpc_url: manifest.network.rpc_url,
      tip_at_verification: tip.toString(),
    },
    deployment_authority: { address, lock: ownerLock },
    transaction: {
      tx_hash: txHash,
      full_hash: signed.hashFull(),
      block_hash: confirmed.blockHash,
      block_number: confirmed.blockNumber.toString(),
      required_confirmations: manifest.required_confirmations,
      inputs: signed.inputs.length,
      outputs: signed.outputs.length,
      code_outputs: artifacts.length,
      added_capacity_inputs: addedInputs,
      fee_completion: feeCompletion,
      fee_rate_shannons_per_kb: manifest.fee_rate_shannons_per_kb,
      fee_shannons: fee.toString(),
      serialized_bytes: signed.toBytes().length,
      dry_run_cycles: dryRunCycles.toString(),
    },
    balance: { before_shannons: balanceBefore.toString(), after_shannons: balanceAfter.toString() },
    artifacts: verified,
    generated_at_utc: new Date().toISOString(),
  };
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await rename(temporary, output);
  console.log(JSON.stringify({ status: report.status, batch: batch.id, tx_hash: txHash, artifacts: artifacts.length }));
}

function staticBatchCheck(manifest, report) {
  if (report.schema !== BATCH_SCHEMA || report.status !== "passed" || report.release_line !== manifest.release_line) {
    fail(`invalid deployment batch report identity`);
  }
  if (report.artifact_source_commit !== manifest.artifact_source_commit) fail(`deployment batch source commit mismatch`);
  const batch = manifest.batches.find((candidate) => candidate.id === report.batch?.id);
  if (!batch || report.batch.purpose !== batch.purpose) fail(`deployment batch scope mismatch`);
  if (report.network?.chain_id !== manifest.network.chain_id || report.network?.genesis_hash !== manifest.network.genesis_hash) {
    fail(`deployment batch network identity mismatch`);
  }
  requireHex(report.transaction?.tx_hash, 32, "transaction.tx_hash");
  requireHex(report.transaction?.block_hash, 32, "transaction.block_hash");
  if (report.transaction?.required_confirmations !== manifest.required_confirmations) fail(`confirmation policy mismatch`);
  if (!Array.isArray(report.artifacts) || report.artifacts.length !== batch.artifacts.length) fail(`deployment artifact count mismatch`);
  for (let index = 0; index < batch.artifacts.length; index += 1) {
    const expected = batch.artifacts[index];
    const actual = report.artifacts[index];
    for (const key of ["id", "purpose", "bytes", "sha256", "ckb_data_hash"]) {
      if (actual?.[key] !== expected[key]) fail(`deployment artifact ${expected.id} ${key} mismatch`);
    }
    if (actual.out_point?.tx_hash !== report.transaction.tx_hash || actual.out_point?.index !== index) {
      fail(`deployment artifact ${expected.id} out point mismatch`);
    }
    if (actual.live !== true || actual.bytes_match !== true || actual.dep_type !== "code" || actual.hash_type !== "data2") {
      fail(`deployment artifact ${expected.id} lacks complete live evidence`);
    }
  }
  return batch;
}

async function verifyBatchNetwork(manifest, report) {
  const { client } = await connectNetwork(manifest);
  const tx = await client.getTransaction(report.transaction.tx_hash);
  if (!tx || tx.status !== "committed" || tx.transaction?.hash() !== report.transaction.tx_hash) fail(`deployment transaction is not committed`);
  const expected = report.artifacts.map((artifact) => ({ ...artifact, data: null }));
  await verifyLiveArtifacts(client, report.deployment_authority.lock, report.transaction.tx_hash, expected);
  const tip = await client.getTip();
  const confirmations = tip - BigInt(report.transaction.block_number) + 1n;
  if (confirmations < BigInt(manifest.required_confirmations)) fail(`deployment transaction lacks required confirmations`);
  return { tx_hash: report.transaction.tx_hash, confirmations: confirmations.toString(), artifacts: report.artifacts.length };
}

async function verifyBatch(args) {
  const root = await canonicalRoot(one(args, "root"));
  const manifestFile = await confinedFile(root, one(args, "manifest"), "manifest");
  const acceptanceReportFile = await confinedFile(root, one(args, "acceptance-report"), "acceptance report");
  const reportFile = path.resolve(one(args, "report"));
  const { manifest } = await validateManifest(root, manifestFile, acceptanceReportFile);
  const report = await loadJson(reportFile);
  staticBatchCheck(manifest, report);
  const result = await verifyBatchNetwork(manifest, report);
  console.log(JSON.stringify({ status: "passed", ...result }));
}

async function combine(args) {
  const root = await canonicalRoot(one(args, "root"));
  const manifestFile = await confinedFile(root, one(args, "manifest"), "manifest");
  const acceptanceReportFile = await confinedFile(root, one(args, "acceptance-report"), "acceptance report");
  const output = path.resolve(one(args, "output"));
  const reportFiles = many(args, "batch-report");
  const { manifest } = await validateManifest(root, manifestFile, acceptanceReportFile);
  if (reportFiles.length !== manifest.batches.length) fail(`combine requires exactly one report for every deployment batch`);
  const reports = [];
  const seen = new Set();
  for (const file of reportFiles) {
    const report = await loadJson(path.resolve(file));
    const batch = staticBatchCheck(manifest, report);
    if (seen.has(batch.id)) fail(`duplicate deployment batch report ${batch.id}`);
    seen.add(batch.id);
    reports.push(report);
  }
  if (manifest.batches.some((batch) => !seen.has(batch.id))) fail(`deployment batch report set is incomplete`);
  reports.sort((left, right) => manifest.batches.findIndex((batch) => batch.id === left.batch.id) - manifest.batches.findIndex((batch) => batch.id === right.batch.id));
  const combined = {
    schema: RELEASE_SCHEMA,
    status: "passed",
    release_line: manifest.release_line,
    artifact_source_commit: manifest.artifact_source_commit,
    network: manifest.network,
    required_confirmations: manifest.required_confirmations,
    deployment_scope: manifest.deployment_scope,
    batches: reports,
    artifact_count: reports.reduce((sum, report) => sum + report.artifacts.length, 0),
    transaction_count: reports.length,
    generated_at_utc: new Date().toISOString(),
  };
  try {
    await lstat(output);
    fail(`refusing to overwrite existing combined deployment report: ${output}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(combined, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, output);
  console.log(JSON.stringify({ status: combined.status, batches: reports.length, artifacts: combined.artifact_count }));
}

async function verifyRelease(args) {
  const root = await canonicalRoot(one(args, "root"));
  const manifestFile = await confinedFile(root, one(args, "manifest"), "manifest");
  const acceptanceReportFile = await confinedFile(root, one(args, "acceptance-report"), "acceptance report");
  const report = await loadJson(path.resolve(one(args, "report")));
  const { manifest } = await validateManifest(root, manifestFile, acceptanceReportFile);
  if (report.schema !== RELEASE_SCHEMA || report.status !== "passed" || !Array.isArray(report.batches)) {
    fail(`invalid combined release deployment report`);
  }
  if (report.artifact_source_commit !== manifest.artifact_source_commit || report.batches.length !== manifest.batches.length) {
    fail(`combined release deployment scope is stale`);
  }
  const results = [];
  const seen = new Set();
  for (const batchReport of report.batches) {
    const batch = staticBatchCheck(manifest, batchReport);
    if (seen.has(batch.id)) fail(`duplicate combined deployment batch ${batch.id}`);
    seen.add(batch.id);
    results.push(await verifyBatchNetwork(manifest, batchReport));
  }
  if (manifest.batches.some((batch) => !seen.has(batch.id))) fail(`combined release deployment is incomplete`);
  console.log(JSON.stringify({ status: "passed", transactions: results, artifacts: report.artifact_count }));
}

async function checkManifest(args) {
  const root = await canonicalRoot(one(args, "root"));
  const manifestFile = await confinedFile(root, one(args, "manifest"), "manifest");
  const acceptanceReportFile = await confinedFile(root, one(args, "acceptance-report"), "acceptance report");
  const { manifest, artifacts } = await validateManifest(root, manifestFile, acceptanceReportFile);
  console.log(
    JSON.stringify({
      status: "passed",
      release_line: manifest.release_line,
      batches: manifest.batches.length,
      artifacts: artifacts.length,
      artifact_bytes: artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
    }),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case "check-manifest":
      await checkManifest(args);
      break;
    case "deploy-batch":
      await deployBatch(args);
      break;
    case "verify-batch":
      await verifyBatch(args);
      break;
    case "combine":
      await combine(args);
      break;
    case "verify-release":
      await verifyRelease(args);
      break;
    default:
      fail(`usage: pudge-release-evidence.mjs <check-manifest|deploy-batch|verify-batch|combine|verify-release> --root ROOT --manifest PATH --acceptance-report PATH ...`);
  }
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
});
