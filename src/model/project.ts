export const STUDIO_PROJECT_VERSION = 1 as const;

export const SEGMENT_COLORS = [
  "coral",
  "teal",
  "yellow",
  "violet",
  "blue",
  "rose"
] as const;

export type SegmentColor = (typeof SEGMENT_COLORS)[number];

export const SEGMENT_ROLES = [
  { value: "body-loop", label: "Loop body" },
  { value: "body-finite", label: "Finite body" },
  { value: "bridge-locked", label: "Locked bridge" },
  { value: "bridge-reversible", label: "Reversible bridge" },
  { value: "one-shot", label: "One shot" },
  { value: "event", label: "Event region" }
] as const;

export type SegmentRole = (typeof SEGMENT_ROLES)[number]["value"];

export interface Segment {
  readonly id: string;
  readonly name: string;
  readonly role: SegmentRole;
  readonly event: string;
  /** Inclusive frame on the project grid. */
  readonly startFrame: number;
  /** Exclusive frame on the project grid. */
  readonly endFrame: number;
  readonly color: SegmentColor;
}

export interface VideoSource {
  readonly name: string;
  readonly path: string | null;
  readonly url: string;
  readonly revokeUrl: (() => void) | null;
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
  readonly totalFrames: number;
}

export interface StudioProjectDocument {
  readonly projectVersion: typeof STUDIO_PROJECT_VERSION;
  readonly name: string;
  readonly source: {
    readonly name: string;
    readonly path: string | null;
    readonly durationSeconds: number;
    readonly width: number;
    readonly height: number;
    readonly frameRate: number;
    readonly totalFrames: number;
  };
  readonly segments: readonly Omit<Segment, "color">[];
}

const DEFAULT_FRAME_RATE = 30_000 / 1_001;

function segmentId(index: number): string {
  return `segment-${String(index + 1)}`;
}

function integerFrame(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function frameRateOrDefault(value: number): number {
  return Number.isFinite(value) && value > 0 && value <= 60
    ? value
    : DEFAULT_FRAME_RATE;
}

export function framesForDuration(durationSeconds: number, frameRate: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 1;
  return Math.max(1, Math.round(durationSeconds * frameRateOrDefault(frameRate)));
}

/**
 * Start with the most useful AVAL-shaped timeline: one held frame followed by
 * entry, loop, and exit regions. Every value remains editable after import.
 */
export function createStarterSegments(totalFrames: number): readonly Segment[] {
  const frames = Math.max(1, Math.floor(totalFrames));
  if (frames < 4) {
    return [
      {
        id: segmentId(0),
        name: "Main",
        role: "body-loop",
        event: "activate",
        startFrame: 0,
        endFrame: frames,
        color: "yellow"
      }
    ];
  }

  const restEnd = 1;
  const entryEnd = integerFrame(frames * (2 / 15), restEnd + 1, frames - 2);
  const loopEnd = integerFrame(frames * (11 / 15), entryEnd + 1, frames - 1);

  return [
    {
      id: segmentId(0),
      name: "Rest",
      role: "body-finite",
      event: "pointer.leave",
      startFrame: 0,
      endFrame: restEnd,
      color: "coral"
    },
    {
      id: segmentId(1),
      name: "Entry",
      role: "bridge-locked",
      event: "pointer.enter",
      startFrame: restEnd,
      endFrame: entryEnd,
      color: "teal"
    },
    {
      id: segmentId(2),
      name: "Loop",
      role: "body-loop",
      event: "pointer.enter",
      startFrame: entryEnd,
      endFrame: loopEnd,
      color: "yellow"
    },
    {
      id: segmentId(3),
      name: "Exit",
      role: "bridge-locked",
      event: "pointer.leave",
      startFrame: loopEnd,
      endFrame: frames,
      color: "violet"
    }
  ];
}

export function updateSegment(
  segments: readonly Segment[],
  id: string,
  update: Partial<Omit<Segment, "id" | "color">>,
  totalFrames: number
): readonly Segment[] {
  const sorted = [...segments].sort((left, right) => left.startFrame - right.startFrame);
  const index = sorted.findIndex((segment) => segment.id === id);
  if (index < 0) return segments;

  const current = sorted[index]!;
  const previous = sorted[index - 1];
  const next = sorted[index + 1];
  const proposedStart = update.startFrame === undefined || !Number.isFinite(update.startFrame)
    ? current.startFrame
    : update.startFrame;
  const proposedEnd = update.endFrame === undefined || !Number.isFinite(update.endFrame)
    ? current.endFrame
    : update.endFrame;
  const minimumStart = previous?.endFrame ?? 0;
  const maximumEnd = next?.startFrame ?? totalFrames;
  const startFrame = integerFrame(
    proposedStart,
    minimumStart,
    Math.max(minimumStart, Math.min(current.endFrame - 1, maximumEnd - 1))
  );
  const endFrame = integerFrame(
    proposedEnd,
    startFrame + 1,
    Math.max(startFrame + 1, maximumEnd)
  );

  const replacement: Segment = {
    ...current,
    ...update,
    name: (update.name ?? current.name).trimStart(),
    event: (update.event ?? current.event).trimStart(),
    startFrame,
    endFrame
  };

  return sorted.map((segment) => segment.id === id ? replacement : segment);
}

export function splitSegment(
  segments: readonly Segment[],
  selectedId: string,
  requestedFrame: number
): { readonly segments: readonly Segment[]; readonly selectedId: string } {
  const sorted = [...segments].sort((left, right) => left.startFrame - right.startFrame);
  const index = sorted.findIndex((segment) => segment.id === selectedId);
  if (index < 0) return { segments, selectedId };
  const selected = sorted[index]!;
  if (selected.endFrame - selected.startFrame < 2) {
    return { segments, selectedId };
  }
  const midpoint = Math.floor((selected.startFrame + selected.endFrame) / 2);
  const splitFrame = integerFrame(
    requestedFrame,
    selected.startFrame + 1,
    selected.endFrame - 1
  );
  const boundary = Number.isFinite(requestedFrame) ? splitFrame : midpoint;
  const nextOrdinal = sorted.reduce((maximum, segment) => {
    const match = /segment-(\d+)$/u.exec(segment.id);
    return Math.max(maximum, match === null ? 0 : Number(match[1]));
  }, 0) + 1;
  const nextId = `segment-${String(nextOrdinal)}`;
  const left: Segment = { ...selected, endFrame: boundary };
  const right: Segment = {
    id: nextId,
    name: `Segment ${String(sorted.length + 1)}`,
    role: "event",
    event: "custom.event",
    startFrame: boundary,
    endFrame: selected.endFrame,
    color: SEGMENT_COLORS[nextOrdinal % SEGMENT_COLORS.length]!
  };

  sorted.splice(index, 1, left, right);
  return { segments: sorted, selectedId: nextId };
}

export function removeSegment(
  segments: readonly Segment[],
  id: string
): { readonly segments: readonly Segment[]; readonly selectedId: string | null } {
  if (segments.length <= 1) return { segments, selectedId: id };
  const index = segments.findIndex((segment) => segment.id === id);
  if (index < 0) return { segments, selectedId: segments[0]?.id ?? null };
  const remaining = segments.filter((segment) => segment.id !== id);
  return {
    segments: remaining,
    selectedId: remaining[Math.min(index, remaining.length - 1)]?.id ?? null
  };
}

export function selectedSegment(
  segments: readonly Segment[],
  id: string | null
): Segment | null {
  return id === null ? null : segments.find((segment) => segment.id === id) ?? null;
}

export function projectDocument(
  source: VideoSource,
  segments: readonly Segment[]
): StudioProjectDocument {
  const name = source.name.replace(/\.[^.]+$/u, "") || "Untitled motion";
  return {
    projectVersion: STUDIO_PROJECT_VERSION,
    name,
    source: {
      name: source.name,
      path: source.path,
      durationSeconds: source.durationSeconds,
      width: source.width,
      height: source.height,
      frameRate: source.frameRate,
      totalFrames: source.totalFrames
    },
    segments: segments.map(({ color: _color, ...segment }) => segment)
  };
}

export function formatFrameRate(frameRate: number): string {
  const value = frameRateOrDefault(frameRate);
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function frameToSeconds(frame: number, frameRate: number): number {
  return Math.max(0, frame) / frameRateOrDefault(frameRate);
}
