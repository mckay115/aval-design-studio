import { useCallback, useEffect, useId, useRef } from "react";

interface ScrubbableNumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly onChange: (value: number) => void;
}

interface DragState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startValue: number;
  lastValue: number;
  dragged: boolean;
}

const PIXELS_PER_STEP = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function ScrubbableNumberField({
  label,
  value,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  onChange
}: ScrubbableNumberFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const stopListeningRef = useRef<() => void>(() => undefined);

  const finishDrag = useCallback((focusInput = false): void => {
    const drag = dragRef.current;
    if (drag === null) return;
    stopListeningRef.current();
    stopListeningRef.current = () => undefined;
    dragRef.current = null;
    document.body.classList.remove("is-number-scrubbing");
    if (focusInput && !drag.dragged) inputRef.current?.focus();
  }, []);

  useEffect(() => finishDrag, [finishDrag]);

  return (
    <label className="scrubbable-number-label" htmlFor={inputId}>
      <span
        className="scrub-label"
        title="Drag left or right to adjust"
        onClick={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          finishDrag();
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startValue: value,
            lastValue: value,
            dragged: false
          };
          document.body.classList.add("is-number-scrubbing");

          const move = (moveEvent: PointerEvent): void => {
            const drag = dragRef.current;
            if (drag === null || drag.pointerId !== moveEvent.pointerId) return;
            const pixelDelta = moveEvent.clientX - drag.startX;
            if (Math.abs(pixelDelta) >= PIXELS_PER_STEP) drag.dragged = true;
            if (!drag.dragged) return;
            moveEvent.preventDefault();
            const multiplier = moveEvent.shiftKey ? 10 : 1;
            const steps = Math.round(pixelDelta / PIXELS_PER_STEP);
            const nextValue = clamp(drag.startValue + steps * step * multiplier, min, max);
            if (nextValue === drag.lastValue) return;
            drag.lastValue = nextValue;
            onChange(nextValue);
          };
          const end = (endEvent: PointerEvent): void => {
            if (dragRef.current?.pointerId === endEvent.pointerId) finishDrag(true);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", end);
          window.addEventListener("pointercancel", end);
          stopListeningRef.current = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", end);
            window.removeEventListener("pointercancel", end);
          };
        }}
      >
        {label}
      </span>
      <input
        ref={inputRef}
        id={inputId}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const nextValue = event.currentTarget.valueAsNumber;
          if (Number.isFinite(nextValue)) onChange(clamp(nextValue, min, max));
        }}
      />
    </label>
  );
}
