/** Client-side SHA-256 hex digest of raw image bytes (Web Crypto). */
export async function computeImageHashSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Server-side validation for form-submitted image hashes. */
export function isValidImageHashHex(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}
