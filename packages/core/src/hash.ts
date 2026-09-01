export function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    const character = value.charCodeAt(index);
    hash ^= character;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function stableEventId(value: string): string {
  return `evt_${stableHash(value)}`;
}

export function stableConflictId(value: string): string {
  return `conflict_${stableHash(value)}`;
}
