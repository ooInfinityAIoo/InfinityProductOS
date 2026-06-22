// WHY THIS FILE EXISTS:
// Studios keep small display-metadata maps like STATUS_META, PROFILE_META,
// QUEUE_TYPE_META — e.g. STATUS_META['LIVE'] = { label, color }. Several call sites
// index them directly (STATUS_META[row.status].color) with no guard. The moment a
// record carries a status/profile/type the map doesn't know about — a new enum
// value from the backend, a seed typo, a NULL — that direct access throws
// "Cannot read properties of undefined", which (before the studio error boundary)
// blanked the whole app. This was a recurring crash class in the UX audit.
//
// metaLookup centralizes the safe read: unknown/missing key -> caller's fallback,
// never a throw.

export function metaLookup<T>(
  map: Record<string, T>,
  key: string | null | undefined,
  fallback: T
): T {
  if (key == null) return fallback;
  return map[key] ?? fallback;
}
