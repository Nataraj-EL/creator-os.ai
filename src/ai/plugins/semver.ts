function parseVersion(v: string): { major: number; minor: number; patch: number } {
  const clean = v.startsWith('v') ? v.slice(1) : v;
  const parts = clean.split('.').map(x => parseInt(x, 10));
  return {
    major: isNaN(parts[0]) ? 0 : parts[0],
    minor: isNaN(parts[1]) ? 0 : parts[1],
    patch: isNaN(parts[2]) ? 0 : parts[2]
  };
}

function compare(v1: string, v2: string): number {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);

  if (p1.major !== p2.major) return p1.major - p2.major;
  if (p1.minor !== p2.minor) return p1.minor - p2.minor;
  return p1.patch - p2.patch;
}

export function satisfies(version: string, constraint: string): boolean {
  if (!constraint || constraint === '*' || constraint === 'latest') return true;

  const cleanConstraint = constraint.trim();

  if (cleanConstraint.startsWith('^')) {
    const target = cleanConstraint.slice(1);
    const pTarget = parseVersion(target);
    const pVer = parseVersion(version);

    if (pVer.major !== pTarget.major) return false;
    if (compare(version, target) < 0) return false;
    return true;
  }

  if (cleanConstraint.startsWith('~')) {
    const target = cleanConstraint.slice(1);
    const pTarget = parseVersion(target);
    const pVer = parseVersion(version);

    if (pVer.major !== pTarget.major || pVer.minor !== pTarget.minor) return false;
    if (compare(version, target) < 0) return false;
    return true;
  }

  if (cleanConstraint.startsWith('>=')) {
    const target = cleanConstraint.slice(2);
    return compare(version, target) >= 0;
  }

  return compare(version, cleanConstraint) === 0;
}
