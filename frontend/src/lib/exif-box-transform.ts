/** EXIF orientation tag (1–8). Model boxes use raw stored pixels; browsers display oriented pixels. */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export function normalizeExifOrientation(value: unknown): ExifOrientation {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isInteger(n) && n >= 1 && n <= 8) return n as ExifOrientation;
  return 1;
}

function transformPoint(
  x: number,
  y: number,
  orientation: ExifOrientation,
  rawWidth: number,
  rawHeight: number,
): [number, number] {
  const w = rawWidth;
  const h = rawHeight;
  switch (orientation) {
    case 1:
      return [x, y];
    case 2:
      return [w - x, y];
    case 3:
      return [w - x, h - y];
    case 4:
      return [x, h - y];
    case 5:
      return [y, w - x];
    case 6:
      return [h - y, x];
    case 7:
      return [h - y, w - x];
    case 8:
      return [y, w - x];
    default:
      return [x, y];
  }
}

/** Map a model box from raw file pixels to browser display pixel space. */
export function transformBoxRawToDisplay(
  box: [number, number, number, number],
  orientation: ExifOrientation,
  rawWidth: number,
  rawHeight: number,
): [number, number, number, number] {
  if (orientation === 1 || rawWidth <= 0 || rawHeight <= 0) {
    return box;
  }

  const [x1, y1, x2, y2] = box;
  const corners: [number, number][] = [
    transformPoint(x1, y1, orientation, rawWidth, rawHeight),
    transformPoint(x1, y2, orientation, rawWidth, rawHeight),
    transformPoint(x2, y1, orientation, rawWidth, rawHeight),
    transformPoint(x2, y2, orientation, rawWidth, rawHeight),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function displayDimensionsForOrientation(
  rawWidth: number,
  rawHeight: number,
  orientation: ExifOrientation,
): { width: number; height: number } {
  if (orientation >= 5 && orientation <= 8) {
    return { width: rawHeight, height: rawWidth };
  }
  return { width: rawWidth, height: rawHeight };
}
