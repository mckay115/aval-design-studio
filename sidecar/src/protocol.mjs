import { access } from "node:fs/promises";

import { ALL_FORMATS, FilePathSource, Input } from "mediabunny";

export const PROTOCOL_VERSION = 2;

const CODECS = new Set(["av1", "vp9", "h265", "h264"]);

export function validateProject(project) {
  const errors = [];
  if (project === null || typeof project !== "object") return ["project must be an object"];
  if (project.projectVersion !== "1.0") errors.push('projectVersion must be "1.0"');
  if (!["auto", "opaque", "packed"].includes(project.alpha)) errors.push("alpha must be auto, opaque, or packed");
  if (!project.frameRate || !Number.isInteger(project.frameRate.numerator) || !Number.isInteger(project.frameRate.denominator) || project.frameRate.denominator <= 0) {
    errors.push("frameRate must be a positive rational");
  }
  if (!Array.isArray(project.sources) || project.sources.length === 0) errors.push("sources must contain at least one source");
  if (!Array.isArray(project.units) || project.units.length === 0) errors.push("units must contain at least one unit");
  for (const [index, unit] of (project.units || []).entries()) {
    const range = unit.range;
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isInteger)) {
      errors.push(`units[${index}] range must contain two integer frames`);
    } else if (range[0] < 0 || range[1] <= range[0]) {
      errors.push(`units[${index}] has an invalid half-open frame range`);
    }
  }
  const codecs = new Set();
  for (const [index, encoding] of (project.encodings || []).entries()) {
    if (!CODECS.has(encoding.codec)) errors.push(`encodings[${index}] uses an unsupported codec`);
    if (codecs.has(encoding.codec)) errors.push(`encodings[${index}] duplicates ${encoding.codec}`);
    codecs.add(encoding.codec);
  }
  if (codecs.size === 0) errors.push("encodings must select at least one codec");
  return errors;
}

function preparationMode(filePath, descriptor) {
  const extension = filePath.split(".").at(-1)?.toLowerCase() || "";
  if (["mov", "mp4", "m4v"].includes(extension) && descriptor.rotation === 0 && !descriptor.hdr) return "pass-through";
  if (["webm", "mkv"].includes(extension) && descriptor.rotation === 0 && !descriptor.hdr) return "remux";
  return "transcode";
}

export async function probeMedia(filePath, emit = () => undefined) {
  emit({ type: "progress", phase: "probe", completed: 0, total: 1, message: "Reading media container" });
  const input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(filePath) });
  try {
    if (!await input.canRead()) throw new Error("MediaBunny could not identify the input container.");
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("The input does not contain a video track.");
    const [format, mimeType, codec, codecParameter, width, height, rotation, pixelAspect, durationMetadata,
      stats, canBeTransparent, hdr, audioTracks] = await Promise.all([
        input.getFormat(), input.getMimeType(), track.getCodec(), track.getCodecParameterString(),
        track.getDisplayWidth(), track.getDisplayHeight(), track.getRotation(), track.getPixelAspectRatio(),
        track.getDurationFromMetadata(), track.computePacketStats(240), track.canBeTransparent(),
        track.hasHighDynamicRange(), input.getAudioTracks()
      ]);
    const durationSeconds = durationMetadata ?? await track.computeDuration();
    const descriptor = {
      container: format.name,
      mimeType,
      codec: codec ?? "unknown",
      codecParameter,
      width: Math.round(width),
      height: Math.round(height),
      rotation,
      pixelAspect: [pixelAspect.num, pixelAspect.den],
      durationSeconds,
      averageFrameRate: stats.averagePacketRate,
      canBeTransparent,
      hdr,
      audioTrackCount: audioTracks.length
    };
    emit({ type: "progress", phase: "probe", completed: 1, total: 1, message: "Media analysis complete" });
    return { descriptor, preparationMode: preparationMode(filePath, descriptor) };
  } finally {
    input.dispose();
  }
}

async function compilerAvailable() {
  const path = process.env.AVAL_COMPILER_BIN;
  if (!path) return false;
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function handleRequest(request, emit = () => undefined) {
  const requestId = request?.requestId ?? request?.id ?? null;
  if (request?.command === "health") {
    const compiler = await compilerAvailable();
    return {
      requestId,
      type: "result",
      ok: true,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        mediabunnyVersion: "1.50.8",
        compilerAvailable: compiler,
        features: ["health", "probe", "prepare-plan", "validate-project"]
      }
    };
  }
  if (request?.command === "validate-project" || request?.command === "validateProject") {
    const errors = validateProject(request.project ?? request.payload?.project);
    return {
      requestId,
      type: "result",
      ok: errors.length === 0,
      ...(errors.length === 0
        ? { result: { valid: true } }
        : { error: { code: "INVALID_PROJECT", message: "The AVAL project is invalid.", details: errors } })
    };
  }
  if (request?.command === "probe") {
    const filePath = request.payload?.filePath;
    if (typeof filePath !== "string" || filePath.length === 0) {
      return { requestId, type: "result", ok: false, error: { code: "INVALID_INPUT", message: "payload.filePath is required" } };
    }
    try {
      const result = await probeMedia(filePath, event => emit({ requestId, ...event }));
      return { requestId, type: "result", ok: true, result };
    } catch (error) {
      return { requestId, type: "result", ok: false, error: { code: "PROBE_FAILED", message: error instanceof Error ? error.message : "Media probe failed" } };
    }
  }
  return {
    requestId,
    type: "result",
    ok: false,
    error: {
      code: "UNSUPPORTED_COMMAND",
      message: "The command is not supported by this toolchain host."
    }
  };
}
