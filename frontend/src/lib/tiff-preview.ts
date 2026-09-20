const MAX_PREVIEW_DIMENSION = 4096;

export type ImagePreviewSource = {
  url: string;
  /** Full-resolution width when the preview blob is downscaled (TIFF). */
  sourceWidth?: number;
  sourceHeight?: number;
};

export type TiffSourceHints = {
  name?: string | null;
  type?: string | null;
};

export function isTiffSource(hints: TiffSourceHints): boolean {
  const type = (hints.type ?? "").toLowerCase();
  if (type === "image/tiff" || type === "image/x-tiff") return true;
  const name = (hints.name ?? "").toLowerCase();
  return /\.tiff?$/.test(name);
}

async function loadUtif() {
  const mod = await import("utif");
  return mod;
}

/** Decode the first page of a TIFF buffer to a PNG blob for browser display. */
export async function decodeTiffToPngBlob(
  buffer: ArrayBuffer,
): Promise<{ blob: Blob; sourceWidth: number; sourceHeight: number }> {
  const UTIF = await loadUtif();
  const ifds = UTIF.decode(buffer);
  if (!ifds.length) {
    throw new Error("TIFF file contains no image pages.");
  }
  const page = ifds[0];
  UTIF.decodeImage(buffer, page);
  const rgba = UTIF.toRGBA8(page);
  const width = page.width;
  const height = page.height;
  if (!width || !height) {
    throw new Error("TIFF page has invalid dimensions.");
  }

  const canvas = document.createElement("canvas");
  let drawWidth = width;
  let drawHeight = height;
  const scale = Math.min(
    1,
    MAX_PREVIEW_DIMENSION / Math.max(width, height),
  );
  if (scale < 1) {
    drawWidth = Math.max(1, Math.round(width * scale));
    drawHeight = Math.max(1, Math.round(height * scale));
  }
  canvas.width = drawWidth;
  canvas.height = drawHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create canvas context for TIFF preview.");
  }
  const imageData = new ImageData(
    new Uint8ClampedArray(rgba),
    width,
    height,
  );
  if (scale < 1) {
    const tmp = document.createElement("canvas");
    tmp.width = width;
    tmp.height = height;
    const tmpCtx = tmp.getContext("2d");
    if (!tmpCtx) {
      throw new Error("Could not create temporary canvas for TIFF downscale.");
    }
    tmpCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(tmp, 0, 0, drawWidth, drawHeight);
  } else {
    ctx.putImageData(imageData, 0, 0);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode TIFF preview as PNG."))),
      "image/png",
    );
  });
  return { blob, sourceWidth: width, sourceHeight: height };
}

export async function previewUrlFromFetchedBlob(
  blob: Blob,
  hints: TiffSourceHints,
): Promise<ImagePreviewSource> {
  if (!isTiffSource({ ...hints, type: hints.type ?? blob.type })) {
    return { url: URL.createObjectURL(blob) };
  }
  const decoded = await decodeTiffToPngBlob(await blob.arrayBuffer());
  return {
    url: URL.createObjectURL(decoded.blob),
    sourceWidth: decoded.sourceWidth,
    sourceHeight: decoded.sourceHeight,
  };
}

export async function previewUrlFromFile(file: File): Promise<ImagePreviewSource> {
  if (!isTiffSource({ name: file.name, type: file.type })) {
    return { url: URL.createObjectURL(file) };
  }
  const decoded = await decodeTiffToPngBlob(await file.arrayBuffer());
  return {
    url: URL.createObjectURL(decoded.blob),
    sourceWidth: decoded.sourceWidth,
    sourceHeight: decoded.sourceHeight,
  };
}

export function revokePreviewUrl(url: string | null | undefined): void {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}
