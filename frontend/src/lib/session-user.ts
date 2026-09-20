/**
 * Resolve a stable string to store per-user rows. Neon Auth / Better Auth
 * typically expose `id`; we fall back to `email` if needed.
 */
export function getStorableUserId(user: unknown): string | null {
  if (!user || typeof user !== "object") return null;
  const u = user as Record<string, unknown>;
  if (typeof u.id === "string" && u.id.length > 0) return u.id;
  if (typeof u.userId === "string" && u.userId.length > 0) return u.userId;
  if (typeof u.sub === "string" && u.sub.length > 0) return u.sub;
  if (typeof u.email === "string" && u.email.length > 0) return u.email;
  return null;
}
