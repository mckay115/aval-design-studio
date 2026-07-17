import { describe, expect, it } from "vitest";

import type { StudioBodyUnit } from "../model/studio";
import { packUnitLanes } from "./Timeline";

function unit(id: string, range: readonly [number, number]): StudioBodyUnit {
  return { id, name: id, kind: "body", sourceId: "source", range, playback: "loop", ports: [{ id: "default", entryFrame: 0, portalFrames: [0] }], color: "teal" };
}

describe("timeline overlap lanes", () => {
  it("stacks overlapping units and reuses a lane after its range ends", () => {
    const packed = packUnitLanes([unit("a", [0, 100]), unit("b", [20, 80]), unit("c", [100, 140])]);
    expect(packed.map(({ unit: value, lane }) => [value.id, lane])).toEqual([["a", 0], ["b", 1], ["c", 0]]);
  });
});
