import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasSink, Input, WrappedCanvas } from "mediabunny";

import type { PickedVideo } from "../lib/desktop";
import { boundedMediaSize } from "../lib/mediaGeometry";
import {
  frameForSeconds,
  fps,
  rationalFrameRate,
  secondsForFrame,
  type AlphaPreview,
  type MediaDescriptor,
  type PreviewMode,
  type StudioUnit
} from "../model/studio";

const THUMBNAIL_COUNT = 14;

interface MediaSession {
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly descriptor: MediaDescriptor | null;
  readonly status: "idle" | "probing" | "ready" | "unsupported";
  readonly error: string | null;
  readonly thumbnails: readonly string[];
  readonly currentFrame: number;
  readonly currentSeconds: number;
  readonly isPlaying: boolean;
  readonly playbackCompletion: { readonly serial: number; readonly unitId: string | null };
  readonly seekFrame: (frame: number) => void;
  readonly stepFrame: (direction: -1 | 1) => void;
  readonly playUnit: (unit: StudioUnit) => void;
  readonly togglePlayback: () => void;
  readonly stop: () => void;
}

function canvasSize(canvas: HTMLCanvasElement | OffscreenCanvas): readonly [number, number] {
  return [canvas.width, canvas.height];
}

function renderWrapped(
  target: HTMLCanvasElement,
  wrapped: WrappedCanvas,
  mode: AlphaPreview
): void {
  const [width, height] = canvasSize(wrapped.canvas);
  if (target.width !== width || target.height !== height) {
    target.width = width;
    target.height = height;
  }
  const context = target.getContext("2d", { alpha: true, willReadFrequently: mode !== "composite" });
  if (context === null) return;
  context.clearRect(0, 0, width, height);

  if (mode === "composite") {
    context.drawImage(wrapped.canvas, 0, 0, width, height);
    return;
  }
  if (mode === "rgb") {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    context.drawImage(wrapped.canvas, 0, 0, width, height);
    return;
  }

  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const scratchContext = scratch.getContext("2d", { alpha: true, willReadFrequently: true });
  if (scratchContext === null) return;
  scratchContext.drawImage(wrapped.canvas, 0, 0, width, height);
  const pixels = scratchContext.getImageData(0, 0, width, height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const alpha = pixels.data[index + 3]!;
    pixels.data[index] = alpha;
    pixels.data[index + 1] = alpha;
    pixels.data[index + 2] = alpha;
    pixels.data[index + 3] = 255;
  }
  scratchContext.putImageData(pixels, 0, 0);

  if (mode === "alpha") {
    context.drawImage(scratch, 0, 0, width, height);
    return;
  }

  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  context.drawImage(wrapped.canvas, 0, 0, width / 2, height);
  context.drawImage(scratch, width / 2, 0, width / 2, height);
}

async function dataUrlForCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  if (canvas instanceof HTMLCanvasElement) return canvas.toDataURL("image/jpeg", 0.72);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.72 });
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read thumbnail"));
    reader.readAsDataURL(blob);
  });
}

async function nextAnimationFrame(): Promise<number> {
  return await new Promise((resolve) => requestAnimationFrame(resolve));
}

export function useMediaSession(
  selection: PickedVideo | null,
  previewMode: PreviewMode,
  selectedUnit: StudioUnit | null,
  alphaPreview: AlphaPreview
): MediaSession {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<Input | null>(null);
  const sinkRef = useRef<CanvasSink | null>(null);
  const descriptorRef = useRef<MediaDescriptor | null>(null);
  const sourceGenerationRef = useRef(0);
  const playbackGenerationRef = useRef(0);
  const playingRef = useRef(false);
  const frameRef = useRef(0);
  const completionSerialRef = useRef(0);
  const alphaPreviewRef = useRef(alphaPreview);
  const [descriptor, setDescriptor] = useState<MediaDescriptor | null>(null);
  const [status, setStatus] = useState<MediaSession["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<readonly string[]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackCompletion, setPlaybackCompletion] = useState<MediaSession["playbackCompletion"]>({ serial: 0, unitId: null });

  const publishCanvas = useCallback((wrapped: WrappedCanvas): void => {
    const target = canvasRef.current;
    const media = descriptorRef.current;
    if (target === null || media === null) return;
    renderWrapped(target, wrapped, alphaPreviewRef.current);
    const frame = Math.min(media.totalFrames - 1, frameForSeconds(wrapped.timestamp, media.frameRate));
    frameRef.current = frame;
    setCurrentFrame(frame);
    setCurrentSeconds(wrapped.timestamp);
  }, []);

  const stop = useCallback((): void => {
    playbackGenerationRef.current += 1;
    playingRef.current = false;
    setIsPlaying(false);
  }, []);

  const renderFrame = useCallback(async (frame: number, stopPlayback = true): Promise<void> => {
    const sink = sinkRef.current;
    const media = descriptorRef.current;
    if (sink === null || media === null) return;
    if (stopPlayback) stop();
    const generation = ++playbackGenerationRef.current;
    const clamped = Math.min(media.totalFrames - 1, Math.max(0, Math.round(frame)));
    try {
      const wrapped = await sink.getCanvas(secondsForFrame(clamped, media.frameRate));
      if (wrapped === null || generation !== playbackGenerationRef.current) return;
      publishCanvas(wrapped);
    } catch (reason) {
      if (generation === playbackGenerationRef.current) {
        setError(reason instanceof Error ? reason.message : "The requested video frame could not be decoded.");
      }
    }
  }, [publishCanvas, stop]);

  useEffect(() => {
    alphaPreviewRef.current = alphaPreview;
    void renderFrame(frameRef.current, false);
  }, [alphaPreview, renderFrame]);

  useEffect(() => {
    const generation = ++sourceGenerationRef.current;
    playbackGenerationRef.current += 1;
    playingRef.current = false;
    setIsPlaying(false);
    setDescriptor(null);
    descriptorRef.current = null;
    setThumbnails([]);
    setCurrentFrame(0);
    frameRef.current = 0;
    setCurrentSeconds(0);
    setError(null);
    inputRef.current?.dispose();
    inputRef.current = null;
    sinkRef.current = null;
    if (selection === null) {
      setStatus("idle");
      return;
    }
    setStatus("probing");

    const open = async (): Promise<void> => {
      const [{ ALL_FORMATS, BlobSource, CanvasSink, Input, UrlSource }] = await Promise.all([
        import("mediabunny"),
        import("@mediabunny/prores")
      ]);
      const mediaSource = selection.file === null
        ? new UrlSource(selection.url)
        : new BlobSource(selection.file, { maxCacheSize: 8 * 2 ** 20 });
      const input = new Input({ formats: ALL_FORMATS, source: mediaSource });
      inputRef.current = input;
      if (!await input.canRead()) throw new Error("MediaBunny could not identify this container.");
      const track = await input.getPrimaryVideoTrack();
      if (track === null) throw new Error("This file does not contain a video track.");

      const [format, mimeType, codec, codecParameter, width, height, rotation, pixelAspect, durationMetadata,
        stats, canDecode, canBeTransparent, hasHighDynamicRange, audioTracks] = await Promise.all([
        input.getFormat(),
        input.getMimeType(),
        track.getCodec(),
        track.getCodecParameterString(),
        track.getDisplayWidth(),
        track.getDisplayHeight(),
        track.getRotation(),
        track.getPixelAspectRatio(),
        track.getDurationFromMetadata(),
        track.computePacketStats(180),
        track.canDecode(),
        track.canBeTransparent(),
        track.hasHighDynamicRange(),
        input.getAudioTracks()
      ]);
      const durationSeconds = durationMetadata ?? await track.computeDuration();
      const averageFrameRate = stats.averagePacketRate > 0 ? stats.averagePacketRate : 30;
      const frameRate = rationalFrameRate(averageFrameRate);
      const nextDescriptor: MediaDescriptor = {
        name: selection.name,
        path: selection.path,
        container: format.name,
        mimeType,
        codec: codec ?? "unknown",
        codecParameter,
        width: Math.round(width),
        height: Math.round(height),
        rotation,
        pixelAspect: [pixelAspect.num, pixelAspect.den],
        durationSeconds,
        frameRate,
        averageFrameRate,
        totalFrames: Math.max(1, Math.round(durationSeconds * fps(frameRate))),
        variableFrameRate: false,
        canDecode,
        canBeTransparent,
        hasHighDynamicRange,
        audioTrackCount: audioTracks.length
      };
      if (generation !== sourceGenerationRef.current) {
        input.dispose();
        return;
      }
      const previewSize = boundedMediaSize(nextDescriptor.width, nextDescriptor.height, 1_280);
      // Keep opaque tracks on MediaBunny's black-backed path and reserve the
      // alpha-capable canvas for sources that can actually carry transparency.
      // This also avoids unnecessary WebKit compositing work for H.264/HEVC.
      const sink = new CanvasSink(track, {
        width: previewSize.width,
        height: previewSize.height,
        fit: "contain",
        alpha: nextDescriptor.canBeTransparent,
        poolSize: 2
      });
      sinkRef.current = sink;
      descriptorRef.current = nextDescriptor;
      setDescriptor(nextDescriptor);
      setStatus(canDecode ? "ready" : "unsupported");
      if (!canDecode) {
        setError("This codec needs the desktop Source Prep pipeline before it can be previewed.");
        return;
      }
      const first = await sink.getCanvas(0);
      if (first !== null && generation === sourceGenerationRef.current) publishCanvas(first);

      const thumbSink = new CanvasSink(track, { width: 160, height: 90, fit: "cover", alpha: false });
      const times = Array.from({ length: THUMBNAIL_COUNT }, (_, index) =>
        Math.max(0, durationSeconds - 0.001) * index / (THUMBNAIL_COUNT - 1));
      const nextThumbnails: string[] = [];
      for await (const wrapped of thumbSink.canvasesAtTimestamps(times)) {
        if (generation !== sourceGenerationRef.current) return;
        if (wrapped !== null) nextThumbnails.push(await dataUrlForCanvas(wrapped.canvas));
      }
      if (generation === sourceGenerationRef.current) setThumbnails(nextThumbnails);
    };

    void open().catch((reason) => {
      if (generation !== sourceGenerationRef.current) return;
      setStatus("unsupported");
      setError(reason instanceof Error ? reason.message : "The media file could not be opened.");
    });
    return () => {
      sourceGenerationRef.current += 1;
      playbackGenerationRef.current += 1;
      playingRef.current = false;
      inputRef.current?.dispose();
      inputRef.current = null;
      sinkRef.current = null;
    };
  }, [publishCanvas, selection]);

  const startPlayback = useCallback((
    unitRange: readonly [number, number],
    loop: boolean,
    completionUnitId: string | null
  ): void => {
    const sink = sinkRef.current;
    const media = descriptorRef.current;
    if (sink === null || media === null || !media.canDecode) return;
    const generation = ++playbackGenerationRef.current;
    playingRef.current = true;
    setIsPlaying(true);

    const run = async (): Promise<void> => {
      let startFrame = frameRef.current >= unitRange[0] && frameRef.current < unitRange[1]
        ? frameRef.current
        : unitRange[0];
      do {
        const start = secondsForFrame(startFrame, media.frameRate);
        const end = secondsForFrame(unitRange[1], media.frameRate);
        let firstTimestamp: number | null = null;
        let wallStart = 0;
        for await (const wrapped of sink.canvases(start, end)) {
          if (generation !== playbackGenerationRef.current || !playingRef.current) return;
          if (firstTimestamp === null) {
            firstTimestamp = wrapped.timestamp;
            wallStart = performance.now();
          }
          const due = wallStart + (wrapped.timestamp - firstTimestamp) * 1_000;
          while (performance.now() < due) {
            await nextAnimationFrame();
            if (generation !== playbackGenerationRef.current || !playingRef.current) return;
          }
          publishCanvas(wrapped);
        }
        startFrame = unitRange[0];
      } while (loop && generation === playbackGenerationRef.current && playingRef.current);
      if (generation === playbackGenerationRef.current) {
        playingRef.current = false;
        setIsPlaying(false);
        if (!loop && completionUnitId !== null) {
          const serial = ++completionSerialRef.current;
          setPlaybackCompletion({ serial, unitId: completionUnitId });
        }
      }
    };
    void run().catch((reason) => {
      if (generation !== playbackGenerationRef.current) return;
      playingRef.current = false;
      setIsPlaying(false);
      setError(reason instanceof Error ? reason.message : "Playback stopped unexpectedly.");
    });
  }, [publishCanvas]);

  const playUnit = useCallback((unit: StudioUnit): void => {
    startPlayback(unit.range, unit.kind === "body" && unit.playback === "loop", unit.id);
  }, [startPlayback]);

  const togglePlayback = useCallback((): void => {
    if (playingRef.current) {
      stop();
      return;
    }
    const media = descriptorRef.current;
    if (media === null) return;
    const unitRange = previewMode === "source" || selectedUnit === null
      ? [0, media.totalFrames] as const
      : selectedUnit.range;
    const loop = previewMode !== "source" && selectedUnit?.kind === "body" && selectedUnit.playback === "loop";
    startPlayback(unitRange, loop, null);
  }, [previewMode, selectedUnit, startPlayback, stop]);

  const seekFrame = useCallback((frame: number): void => {
    void renderFrame(frame);
  }, [renderFrame]);

  const stepFrame = useCallback((direction: -1 | 1): void => {
    void renderFrame(frameRef.current + direction);
  }, [renderFrame]);

  return {
    canvasRef,
    descriptor,
    status,
    error,
    thumbnails,
    currentFrame,
    currentSeconds,
    isPlaying,
    playbackCompletion,
    seekFrame,
    stepFrame,
    playUnit,
    togglePlayback,
    stop
  };
}
