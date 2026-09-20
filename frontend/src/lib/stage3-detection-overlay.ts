import type { DetectionBoxItem } from "@/components/dashboard/detection-image-preview";

/** Flatten remote Stage 3 `results[]` into overlay items (stable box numbers, class-based colors on client). */
export function buildDetectionOverlayItemsFromResults(
  results: unknown,
): DetectionBoxItem[] {
  if (!Array.isArray(results)) return [];
  const items: DetectionBoxItem[] = [];
  let seq = 0;
  for (const raw of results as Array<Record<string, unknown>>) {
    const pred = raw.prediction as
      | {
          predictions?: Array<{
            class_id?: unknown;
            class_name?: string;
            confidence?: number;
            box?: number[];
          }>;
        }
      | undefined;
    const preds = pred?.predictions;
    if (!Array.isArray(preds)) continue;
    const mf = String(raw.modelFilename ?? "model");
    preds.forEach((p, j) => {
      const box = p.box;
      if (!Array.isArray(box) || box.length < 4) return;
      const [x1, y1, x2, y2] = box.map(Number) as [number, number, number, number];
      if (![x1, y1, x2, y2].every((n) => Number.isFinite(n))) return;
      const classId = typeof p.class_id === "number" ? p.class_id : undefined;
      items.push({
        id: `${mf}-${j}-${p.class_name ?? ""}-${seq}`,
        legendKey: String(seq + 1),
        classId,
        className: String(p.class_name ?? "Unknown"),
        modelFilename: mf,
        confidence: typeof p.confidence === "number" ? p.confidence : 0,
        box: [x1, y1, x2, y2],
      });
      seq += 1;
    });
  }
  return items;
}
