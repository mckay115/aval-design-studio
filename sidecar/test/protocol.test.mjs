import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest, validateProject } from "../src/protocol.mjs";

const project = {
  projectVersion: "1.0",
  alpha: "auto",
  frameRate: { numerator: 24, denominator: 1 },
  sources: [{ id: "source", type: "video", path: "source.mov", timing: { mode: "exact" } }],
  encodings: [{ codec: "h264", renditions: [{ id: "video.1x", width: 640, height: "auto", crf: 26 }] }],
  units: [{ id: "idle.body", kind: "body", source: "source", range: [0, 24], playback: "loop", ports: [] }],
  initialState: "idle",
  states: [{ id: "idle", bodyUnit: "idle.body" }],
  edges: [],
  bindings: []
};

test("health reports protocol and MediaBunny capabilities", async () => {
  const response = await handleRequest({ requestId: "one", command: "health" });
  assert.equal(response.requestId, "one");
  assert.equal(response.ok, true);
  assert.equal(response.result.protocolVersion, 2);
  assert.equal(response.result.mediabunnyVersion, "1.50.8");
});

test("project validation uses AVAL 1.0 half-open ranges", () => {
  assert.deepEqual(validateProject(project), []);
  assert.match(validateProject({ ...project, units: [{ ...project.units[0], range: [4, 4] }] })[0], /invalid half-open frame range/u);
});

test("unknown commands return stable protocol errors", async () => {
  const response = await handleRequest({ requestId: "two", command: "unknown" });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "UNSUPPORTED_COMMAND");
});
