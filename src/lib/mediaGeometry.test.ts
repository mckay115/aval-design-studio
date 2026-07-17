import { describe, expect, it } from "vitest";

import { aspectRatioLabel, boundedMediaSize, containMediaSize } from "./mediaGeometry";

describe("media geometry", () => {
  it.each([
    [1920, 1080, 900, 500, { width: 888.8889, height: 500 }],
    [1080, 1920, 900, 500, { width: 281.25, height: 500 }],
    [1024, 128, 900, 500, { width: 900, height: 112.5 }],
    [128, 1024, 900, 500, { width: 62.5, height: 500 }],
    [640, 640, 900, 500, { width: 500, height: 500 }]
  ])("contains %ix%i inside the stage", (width, height, boundsWidth, boundsHeight, expected) => {
    const actual = containMediaSize(width, height, boundsWidth, boundsHeight);
    expect(actual.width).toBeCloseTo(expected.width, 3);
    expect(actual.height).toBeCloseTo(expected.height, 3);
  });

  it("bounds the longest decoded edge without distorting the ratio", () => {
    expect(boundedMediaSize(1080, 7680, 1280)).toEqual({ width: 180, height: 1280 });
    expect(boundedMediaSize(7680, 1080, 1280)).toEqual({ width: 1280, height: 180 });
  });

  it("reports standard and non-standard ratios exactly", () => {
    expect(aspectRatioLabel(1920, 1080)).toBe("16:9");
    expect(aspectRatioLabel(1080, 1920)).toBe("9:16");
    expect(aspectRatioLabel(1000, 333)).toBe("1000:333");
  });
});
