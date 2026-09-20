import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { exportSquareDishPhoto } from "../settings";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function DishPhotoCrop({
  src,
  onCancel,
  onApply,
}: {
  src: string;
  onCancel: () => void;
  onApply: (dataUrl: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0.5);
  const [panY, setPanY] = useState(0.5);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [frame, setFrame] = useState({ width: 0, height: 0, extraX: 0, extraY: 0 });

  function measure() {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image || !image.naturalWidth) return;
    const size = stage.clientWidth;
    const minSide = Math.min(image.naturalWidth, image.naturalHeight);
    const width = (image.naturalWidth * size * zoom) / minSide;
    const height = (image.naturalHeight * size * zoom) / minSide;
    setFrame({
      width,
      height,
      extraX: Math.max(0, width - size),
      extraY: Math.max(0, height - size),
    });
  }

  useLayoutEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth) setReady(true);
    measure();
  }, [zoom, ready, src]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      panX,
      panY,
    };
    setDragging(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) return;
    const nextX =
      frame.extraX === 0
        ? 0.5
        : clamp(start.panX - (event.clientX - start.x) / frame.extraX, 0, 1);
    const nextY =
      frame.extraY === 0
        ? 0.5
        : clamp(start.panY - (event.clientY - start.y) / frame.extraY, 0, 1);
    setPanX(nextX);
    setPanY(nextY);
  }

  function endDrag() {
    drag.current = null;
    setDragging(false);
  }

  function apply() {
    const image = imageRef.current;
    if (!image || !ready) return;
    try {
      onApply(exportSquareDishPhoto(image, panX, panY, zoom));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not crop that photo.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal dish-crop-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dish-crop-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="dish-crop-title">Frame the dish</h2>
        <p className="subhead">
          Drag to move. Use the slider to zoom. Photos save as a square so every
          dish looks the same on Orders.
        </p>
        <div
          ref={stageRef}
          className={dragging ? "dish-crop-stage is-dragging" : "dish-crop-stage"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img
            ref={imageRef}
            src={src}
            alt=""
            draggable={false}
            style={{
              width: frame.width || undefined,
              height: frame.height || undefined,
              left: -panX * frame.extraX,
              top: -panY * frame.extraY,
            }}
            onLoad={() => {
              setReady(true);
              requestAnimationFrame(measure);
            }}
            onError={() => setError("Could not read that photo.")}
          />
        </div>
        <label className="dish-crop-zoom" htmlFor="dish-crop-zoom">
          Zoom
        </label>
        <input
          id="dish-crop-zoom"
          type="range"
          min="1"
          max="3"
          step="0.02"
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
        />
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn-tandoor" type="button" onClick={apply} disabled={!ready}>
          Use this crop
        </button>
        <button className="ghost-btn modal-cancel" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
