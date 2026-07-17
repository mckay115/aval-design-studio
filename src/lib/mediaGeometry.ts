export interface MediaSize {
  readonly width: number;
  readonly height: number;
}

function safeDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function containMediaSize(
  sourceWidth: number,
  sourceHeight: number,
  boundsWidth: number,
  boundsHeight: number
): MediaSize {
  const width = safeDimension(sourceWidth);
  const height = safeDimension(sourceHeight);
  const availableWidth = Math.max(0, Number.isFinite(boundsWidth) ? boundsWidth : 0);
  const availableHeight = Math.max(0, Number.isFinite(boundsHeight) ? boundsHeight : 0);
  if (availableWidth === 0 || availableHeight === 0) return { width: 0, height: 0 };
  const scale = Math.min(availableWidth / width, availableHeight / height);
  return {
    width: Math.max(1, width * scale),
    height: Math.max(1, height * scale)
  };
}

export function boundedMediaSize(sourceWidth: number, sourceHeight: number, maxEdge: number): MediaSize {
  const width = safeDimension(sourceWidth);
  const height = safeDimension(sourceHeight);
  const edge = Math.max(1, safeDimension(maxEdge));
  const scale = Math.min(1, edge / width, edge / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.max(1, Math.round(Math.abs(left)));
  let b = Math.max(1, Math.round(Math.abs(right)));
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function aspectRatioLabel(width: number, height: number): string {
  const safeWidth = Math.max(1, Math.round(safeDimension(width)));
  const safeHeight = Math.max(1, Math.round(safeDimension(height)));
  const divisor = greatestCommonDivisor(safeWidth, safeHeight);
  return `${safeWidth / divisor}:${safeHeight / divisor}`;
}
