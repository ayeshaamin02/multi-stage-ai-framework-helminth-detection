import {
  displayDimensionsForOrientation,
  normalizeExifOrientation,
  type ExifOrientation,
} from "@/lib/exif-box-transform";

export type ImageBoxCoordinateMeta = {
  orientation: ExifOrientation;
  rawWidth: number;
  rawHeight: number;
  displayWidth: number;
  displayHeight: number;
};

const TIFF_ORIENTATION = 274;

function readUint16(data: DataView, offset: number, littleEndian: boolean): number {
  return data.getUint16(offset, littleEndian);
}

function readUint32(data: DataView, offset: number, littleEndian: boolean): number {
  return data.getUint32(offset, littleEndian);
}

/** Parse JPEG APP1 EXIF for Orientation (tag 0x0112). Returns 1 when absent. */
function parseJpegExifOrientation(buffer: ArrayBuffer): ExifOrientation {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xd8 || marker === 0x01) {
      offset += 2;
      continue;
    }
    const segmentLength = view.getUint16(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > view.byteLength) break;

    if (marker === 0xe1) {
      const exifStart = offset + 4;
      if (
        view.byteLength >= exifStart + 6 &&
        view.getUint8(exifStart) === 0x45 &&
        view.getUint8(exifStart + 1) === 0x78 &&
        view.getUint8(exifStart + 2) === 0x69 &&
        view.getUint8(exifStart + 3) === 0x66
      ) {
        const tiffStart = exifStart + 6;
        if (tiffStart + 8 > view.byteLength) return 1;
        const endian =
          view.getUint8(tiffStart) === 0x49 && view.getUint8(tiffStart + 1) === 0x49
            ? true
            : view.getUint8(tiffStart) === 0x4d && view.getUint8(tiffStart + 1) === 0x4d
              ? false
              : null;
        if (endian === null) return 1;

        const ifdOffset = tiffStart + readUint32(view, tiffStart + 4, endian);
        if (ifdOffset + 2 > view.byteLength) return 1;
        const entries = readUint16(view, ifdOffset, endian);
        for (let i = 0; i < entries; i += 1) {
          const entry = ifdOffset + 2 + i * 12;
          if (entry + 12 > view.byteLength) break;
          const tag = readUint16(view, entry, endian);
          if (tag !== 0x0112) continue;
          const value = readUint16(view, entry + 8, endian);
          return normalizeExifOrientation(value);
        }
      }
    }

    offset += 2 + segmentLength;
  }

  return 1;
}

async function readRawPixelDimensions(blob: Blob): Promise<{
  rawWidth: number;
  rawHeight: number;
}> {
  if (typeof createImageBitmap !== "undefined") {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "none" });
    try {
      return { rawWidth: bitmap.width, rawHeight: bitmap.height };
    } finally {
      bitmap.close?.();
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ rawWidth: img.naturalWidth, rawHeight: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions."));
    };
    img.src = url;
  });
}

async function readTiffOrientation(buffer: ArrayBuffer): Promise<ExifOrientation> {
  try {
    const mod = await import("utif");
    const UTIF = mod.default ?? mod;
    const ifds = UTIF.decode(buffer);
    const page = ifds[0];
    if (!page) return 1;
    const raw = page[TIFF_ORIENTATION] ?? page.orientation;
    return normalizeExifOrientation(raw);
  } catch {
    return 1;
  }
}

async function readOrientationFromBlob(blob: Blob): Promise<ExifOrientation> {
  const type = blob.type.toLowerCase();
  const head = await blob.slice(0, Math.min(blob.size, 256 * 1024)).arrayBuffer();

  if (type.includes("tiff") || isTiffBuffer(head)) {
    return readTiffOrientation(await blob.arrayBuffer());
  }

  if (
    type.includes("jpeg") ||
    type.includes("jpg") ||
    (head.byteLength >= 2 && new DataView(head).getUint16(0) === 0xffd8)
  ) {
    return parseJpegExifOrientation(head);
  }

  return 1;
}

function isTiffBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const view = new DataView(buffer);
  const le = view.getUint16(0) === 0x4949;
  const be = view.getUint16(0) === 0x4d4d;
  return le || be;
}

/** Metadata for mapping model boxes (raw bytes) onto browser preview pixels. */
export async function readImageBoxCoordinateMeta(
  blob: Blob,
): Promise<ImageBoxCoordinateMeta | null> {
  try {
    const [{ rawWidth, rawHeight }, orientation] = await Promise.all([
      readRawPixelDimensions(blob),
      readOrientationFromBlob(blob),
    ]);
    if (rawWidth <= 0 || rawHeight <= 0) return null;
    const display = displayDimensionsForOrientation(
      rawWidth,
      rawHeight,
      orientation,
    );
    return {
      orientation,
      rawWidth,
      rawHeight,
      displayWidth: display.width,
      displayHeight: display.height,
    };
  } catch {
    return null;
  }
}

export async function readImageBoxCoordinateMetaFromFile(
  file: File,
): Promise<ImageBoxCoordinateMeta | null> {
  return readImageBoxCoordinateMeta(file);
}
