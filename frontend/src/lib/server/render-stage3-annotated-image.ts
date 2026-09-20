import { transformBoxRawToDisplay, normalizeExifOrientation } from "@/lib/exif-box-transform";
import {
  DETECTION_PALETTE,
  paletteIndexForClass,
} from "@/lib/detection-palette";
import type { HelminthStatusPayload } from "@/lib/helminth-remote";
import sharp from "sharp";

function svgEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type FlatBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  legendKey: string;
  stroke: string;
  fill: string;
  badge: string;
};

function flattenBoxes(remote: HelminthStatusPayload): FlatBox[] {
  const results = remote.results;
  if (!Array.isArray(results)) return [];
  const out: FlatBox[] = [];
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
    for (const p of preds) {
      const box = p.box;
      if (!Array.isArray(box) || box.length < 4) continue;
      const [x1, y1, x2, y2] = box.map(Number) as [number, number, number, number];
      if (![x1, y1, x2, y2].every((n) => Number.isFinite(n))) continue;
      const classId = typeof p.class_id === "number" ? p.class_id : undefined;
      const className = String(p.class_name ?? "");
      const pi = paletteIndexForClass(classId, className);
      const pal = DETECTION_PALETTE[pi]!;
      seq += 1;
      out.push({
        x1,
        y1,
        x2,
        y2,
        legendKey: String(seq),
        stroke: pal.border,
        fill: `${pal.border}22`,
        badge: pal.badge,
      });
    }
  }
  return out;
}

/** Composite bounding boxes onto the original image; returns null if nothing to draw. */
export async function renderStage3AnnotatedPng(params: {
  imageBuf: Buffer;
  remote: HelminthStatusPayload;
}): Promise<Buffer | null> {
  const boxes = flattenBoxes(params.remote);
  if (boxes.length === 0) return null;

  const rawMeta = await sharp(params.imageBuf).metadata();
  const rawW = rawMeta.width ?? 0;
  const rawH = rawMeta.height ?? 0;
  if (rawW <= 0 || rawH <= 0) return null;

  const orientation = normalizeExifOrientation(rawMeta.orientation);
  const oriented = sharp(params.imageBuf).rotate();
  const orientedBuf = await oriented.toBuffer();
  const orientedMeta = await oriented.metadata();
  const w = orientedMeta.width ?? 0;
  const h = orientedMeta.height ?? 0;
  if (w <= 0 || h <= 0) return null;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
  ];
  for (const b of boxes) {
    const [tx1, ty1, tx2, ty2] = transformBoxRawToDisplay(
      [b.x1, b.y1, b.x2, b.y2],
      orientation,
      rawW,
      rawH,
    );
    const x1 = Math.min(tx1, tx2);
    const y1 = Math.min(ty1, ty2);
    const x2 = Math.max(tx1, tx2);
    const y2 = Math.max(ty1, ty2);
    const bw = Math.max(0, x2 - x1);
    const bh = Math.max(0, y2 - y1);
    const label = svgEscape(b.legendKey);
    // Match the live overlay idea: label scales with box size so a tiny detection
    // does not get a fixed ~18px badge that covers the object on full-res exports.
    const boxShort = Math.min(bw, bh);
    const badgeH =
      boxShort > 0
        ? Math.round(Math.min(22, Math.max(11, boxShort * 0.42)))
        : 18;
    const fontSize = Math.max(9, badgeH - 6);
    const charW = Math.max(5, Math.round(fontSize * 0.62));
    let badgeW = Math.max(badgeH, 5 + label.length * charW);
    if (bw > 0) {
      badgeW = Math.min(badgeW, Math.max(badgeH, bw));
    }
    const textY = y1 + Math.round(badgeH * 0.72);
    const fillParts = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(b.fill);
    const fillBase = fillParts ? `#${fillParts[1]}` : b.fill;
    const fillOpacity = fillParts
      ? String(Math.round((parseInt(fillParts[2], 16) / 255) * 1000) / 1000)
      : "1";
    parts.push(
      `<rect x="${x1}" y="${y1}" width="${bw}" height="${bh}" fill="${fillBase}" fill-opacity="${fillOpacity}" stroke="${b.stroke}" stroke-width="2"/>`,
      `<rect x="${x1}" y="${y1}" width="${badgeW}" height="${badgeH}" fill="${b.badge}"/>`,
      `<text x="${x1 + 4}" y="${textY}" fill="white" font-size="${fontSize}" font-family="Helvetica, Arial, Liberation Sans, DejaVu Sans, sans-serif" font-weight="700">${label}</text>`,
    );
  }
  parts.push("</svg>");
  const svg = parts.join("");

  return sharp(orientedBuf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png({ compressionLevel: 8 })
    .toBuffer();
}
