export function selectRegistryRelease(releases, latestRelease, requestedRelease) {
  if (!Array.isArray(releases) || releases.length === 0) return undefined;
  const requested = String(requestedRelease ?? "").trim();
  if (requested) {
    const selected = releases.find((release) => release?.release === requested);
    if (selected) return selected;
  }
  return releases.find((release) => release?.release === latestRelease) ?? releases[0];
}

export function registryEvidenceForRelease(release, topLevelEvidence, releaseCount) {
  if (!release) return [];
  const directEvidence = Array.isArray(release.evidence) ? release.evidence : [];
  if (directEvidence.length > 0) return directEvidence;

  const aggregate = Array.isArray(topLevelEvidence) ? topLevelEvidence : [];
  const versioned = aggregate.filter((item) => item?.version === release.release);
  if (versioned.length > 0) return versioned;

  return releaseCount === 1
    ? aggregate.filter((item) => !item?.version || item.version === release.release)
    : [];
}

export function mayUseAggregateDeployments(release, latestRelease, releaseCount) {
  if (!release) return false;
  return releaseCount === 1 || release.release === latestRelease;
}
