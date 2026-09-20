/** Shared palette for detection overlays (client + server raster). */
export const DETECTION_PALETTE = [
  { border: "#ca8a04", badge: "#a16207" },
  { border: "#dc2626", badge: "#b91c1c" },
  { border: "#16a34a", badge: "#15803d" },
  { border: "#2563eb", badge: "#1d4ed8" },
  { border: "#9333ea", badge: "#7e22ce" },
  { border: "#db2777", badge: "#be185d" },
  { border: "#0891b2", badge: "#0e7490" },
  { border: "#ea580c", badge: "#c2410c" },
] as const;

export type DetectionPaletteEntry = (typeof DETECTION_PALETTE)[number];

/** Stable color per species (class_id + class_name); same class always maps to same color. */
export function paletteIndexForClass(
  classId: number | null | undefined,
  className: string | null | undefined,
): number {
  const key = `${classId ?? "x"}|${(className ?? "").toLowerCase().trim()}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33) ^ key.charCodeAt(i)!;
  }
  return Math.abs(hash) % DETECTION_PALETTE.length;
}

export function getDetectionPaletteEntryForClass(
  classId: number | null | undefined,
  className: string | null | undefined,
): DetectionPaletteEntry {
  return DETECTION_PALETTE[paletteIndexForClass(classId, className)]!;
}
