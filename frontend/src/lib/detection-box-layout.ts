import {
  displayDimensionsForOrientation,
  transformBoxRawToDisplay,
  type ExifOrientation,
} from "@/lib/exif-box-transform";

export type ObjectFitContainLayout = {
  containerWidth: number;
  containerHeight: number;
  /** Intrinsic pixel size of the displayed image (`naturalWidth` / `naturalHeight`). */
  imageWidth: number;
  imageHeight: number;
  /** Full-resolution width when preview pixels are downscaled (e.g. TIFF). */
  boxSourceWidth?: number;
  boxSourceHeight?: number;
  /** EXIF orientation of uploaded bytes (model uses raw pixel space). */
  exifOrientation?: ExifOrientation;
  rawWidth?: number;
  rawHeight?: number;
};

export type MappedBoxRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Map model pixel boxes onto a CSS `object-fit: contain` layout (uniform scale + letterbox offset). */
export function mapBoxToObjectFitContain(
  box: [number, number, number, number],
  layout: ObjectFitContainLayout,
): MappedBoxRect {
  const rawW = layout.rawWidth ?? layout.boxSourceWidth ?? layout.imageWidth;
  const rawH = layout.rawHeight ?? layout.boxSourceHeight ?? layout.imageHeight;
  const orientation = layout.exifOrientation ?? 1;

  if (
    rawW <= 0 ||
    rawH <= 0 ||
    layout.imageWidth <= 0 ||
    layout.imageHeight <= 0 ||
    layout.containerWidth <= 0 ||
    layout.containerHeight <= 0
  ) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  let workingBox = box;
  if (orientation !== 1) {
    workingBox = transformBoxRawToDisplay(workingBox, orientation, rawW, rawH);
  }

  const display = displayDimensionsForOrientation(rawW, rawH, orientation);
  const coordSpaceW =
    orientation !== 1 ? display.width : (layout.boxSourceWidth ?? rawW);
  const coordSpaceH =
    orientation !== 1 ? display.height : (layout.boxSourceHeight ?? rawH);

  const [x1, y1, x2, y2] = workingBox;
  const toPreviewX = layout.imageWidth / coordSpaceW;
  const toPreviewY = layout.imageHeight / coordSpaceH;
  const px1 = x1 * toPreviewX;
  const py1 = y1 * toPreviewY;
  const px2 = x2 * toPreviewX;
  const py2 = y2 * toPreviewY;

  const displayScale = Math.min(
    layout.containerWidth / layout.imageWidth,
    layout.containerHeight / layout.imageHeight,
  );
  const renderedW = layout.imageWidth * displayScale;
  const renderedH = layout.imageHeight * displayScale;
  const offsetX = (layout.containerWidth - renderedW) / 2;
  const offsetY = (layout.containerHeight - renderedH) / 2;

  return {
    left: offsetX + Math.min(px1, px2) * displayScale,
    top: offsetY + Math.min(py1, py2) * displayScale,
    width: Math.max(0, Math.abs(px2 - px1) * displayScale),
    height: Math.max(0, Math.abs(py2 - py1) * displayScale),
  };
}
