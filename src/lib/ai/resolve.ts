export type LabCandidate = { id: string; name: string; code: string };
export type EquipmentCandidate = {
  id: string;
  name: string;
  assetCode: string;
  categoryName: string;
  available: number;
};

export type Resolution<T> = { match: T | null; candidates: T[] };

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

function overlapScore(hint: string, candidate: string): number {
  const hintTokens = tokens(hint);
  if (hintTokens.length === 0) return 0;
  const candidateTokens = new Set(tokens(candidate));
  const hits = hintTokens.filter((token) => candidateTokens.has(token)).length;
  return hits / hintTokens.length;
}

/**
 * Exact match on any haystack field first, then token-overlap scoring.
 * The model only ever supplies hints; real IDs are resolved here.
 * Closest candidates are always returned (even below the match threshold)
 * so the UI can offer picks for unmatched hints.
 */
function best<T>(hint: string, items: T[], haystack: (item: T) => string[]): Resolution<T> {
  const normHint = normalize(hint);

  const exact = items.find((item) => haystack(item).some((field) => normalize(field) === normHint));
  if (exact) return { match: exact, candidates: [exact] };

  const scored = items
    .map((item) => ({
      item,
      score: Math.max(...haystack(item).map((field) => overlapScore(hint, field))),
    }))
    .sort((a, b) => b.score - a.score);

  const above = scored.filter((entry) => entry.score >= 0.6);
  const pool = above.length > 0 ? above : scored.filter((entry) => entry.score > 0);

  return { match: above[0]?.item ?? null, candidates: pool.slice(0, 3).map((entry) => entry.item) };
}

export function resolveLab(hint: string | null, labs: LabCandidate[]): Resolution<LabCandidate> {
  if (!hint) return { match: null, candidates: [] };
  return best(hint, labs, (lab) => [lab.name, lab.code]);
}

export function resolveEquipment(
  hint: string | null,
  items: EquipmentCandidate[],
): Resolution<EquipmentCandidate> {
  if (!hint) return { match: null, candidates: [] };
  return best(hint, items, (item) => [item.name, item.assetCode, item.categoryName]);
}
