import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  resolvePreviewCameraGeometry,
  resolvePreviewCharacterGeometry,
  type PreviewCameraGeometry,
  type LoadedPreviewMedia,
  type PreviewCharacterGeometry
} from "./preview-media-runtime";
import type { PreviewMediaRole } from "./preview-media-host";
import type { StageEasing } from "@world-studio/story-language";
import { PREVIEW_RENDER_HOST_CAPABILITIES, type PreviewRenderFrame } from "./preview-render-host";
import { PreviewVisualHost } from "./preview-visual-host";
import { mapClientPointToStage, type StageDesignPoint } from "./stage-surface";

type LoadedPreviewCharacter = LoadedPreviewMedia["characters"][number];

export interface PreviewCanvasImage {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

export interface PreviewCanvasImageSet {
  readonly background?: PreviewCanvasImage;
  readonly previousBackground?: PreviewCanvasImage;
  readonly characters: ReadonlyMap<string, PreviewCanvasImage>;
}

export interface PreviewCanvasCharacterRect {
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export function resolvePreviewCanvasCharacterRect(
  character: LoadedPreviewCharacter,
  imageWidth: number,
  imageHeight: number,
  designWidth: number,
  designHeight: number
): PreviewCanvasCharacterRect {
  const geometry = resolvePreviewCharacterGeometry(character);
  return resolveCanvasCharacterRect(geometry, imageWidth, imageHeight, designWidth, designHeight);
}

function resolveCanvasCharacterRect(
  geometry: PreviewCharacterGeometry,
  imageWidth: number,
  imageHeight: number,
  designWidth: number,
  designHeight: number
): PreviewCanvasCharacterRect {
  const safeWidth = Math.max(1, imageWidth);
  const safeHeight = Math.max(1, imageHeight);
  const fit = Math.min(designWidth * 0.46 / safeWidth, designHeight * 0.9 / safeHeight);
  const width = safeWidth * fit * geometry.scale;
  const height = safeHeight * fit * geometry.scale;
  return {
    width,
    height,
    offsetX: -geometry.anchorX * width,
    offsetY: -geometry.anchorY * height
  };
}

function interpolateGeometry(
  from: PreviewCharacterGeometry,
  to: PreviewCharacterGeometry,
  progress: number
): PreviewCharacterGeometry {
  const value = Math.min(1, Math.max(0, progress));
  const interpolate = (start: number, end: number) => start + (end - start) * value;
  return {
    x: interpolate(from.x, to.x),
    y: interpolate(from.y, to.y),
    scale: interpolate(from.scale, to.scale),
    rotation: interpolate(from.rotation, to.rotation),
    anchorX: interpolate(from.anchorX, to.anchorX),
    anchorY: interpolate(from.anchorY, to.anchorY)
  };
}

function interpolateCameraGeometry(from: PreviewCameraGeometry, to: PreviewCameraGeometry, progress: number): PreviewCameraGeometry {
  const value = Math.min(1, Math.max(0, progress));
  const interpolate = (start: number, end: number) => start + (end - start) * value;
  return { x: interpolate(from.x, to.x), y: interpolate(from.y, to.y), zoom: interpolate(from.zoom, to.zoom), rotation: interpolate(from.rotation, to.rotation) };
}

const CSS_EASING_CONTROL_POINTS: Readonly<Record<Exclude<StageEasing, "linear">, readonly [number, number, number, number]>> = {
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1]
};

function cubicBezierCoordinate(t: number, first: number, second: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t;
}

export function previewStageEasingProgress(easing: StageEasing | undefined, progress: number): number {
  const bounded = Math.min(1, Math.max(0, progress));
  if (easing === undefined || easing === "linear" || bounded === 0 || bounded === 1) return bounded;
  const [x1, y1, x2, y2] = CSS_EASING_CONTROL_POINTS[easing];
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    if (cubicBezierCoordinate(midpoint, x1, x2) < bounded) lower = midpoint;
    else upper = midpoint;
  }
  return cubicBezierCoordinate((lower + upper) / 2, y1, y2);
}

export function previewCanvasDurationMs(source: string | undefined): number {
  if (source === undefined) return 300;
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/u.exec(source);
  if (match === null) return 300;
  const milliseconds = Number(match[1]) * (match[2] === "s" ? 1000 : 1);
  return Math.min(10_000, Math.max(0, milliseconds));
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: PreviewCanvasImage,
  designWidth: number,
  designHeight: number
): void {
  const scale = Math.max(designWidth / image.width, designHeight / image.height);
  const sourceWidth = designWidth / scale;
  const sourceHeight = designHeight / scale;
  context.drawImage(
    image.source,
    (image.width - sourceWidth) / 2,
    (image.height - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    0,
    0,
    designWidth,
    designHeight
  );
}

function drawFallbackBackground(context: CanvasRenderingContext2D, designWidth: number, designHeight: number): void {
  const gradient = context.createLinearGradient(0, 0, 0, designHeight);
  gradient.addColorStop(0, "#715fae");
  gradient.addColorStop(0.66, "#efb26e");
  gradient.addColorStop(0.67, "#253149");
  context.fillStyle = gradient;
  context.fillRect(0, 0, designWidth, designHeight);
}

function drawTransitionBackgrounds(
  context: CanvasRenderingContext2D,
  frame: PreviewRenderFrame,
  images: PreviewCanvasImageSet,
  designWidth: number,
  designHeight: number,
  selectedStatementId: string,
  progress: number
): void {
  const transitionLayer = frame.background?.statementId === selectedStatementId
    ? frame.background
    : frame.previousBackground?.statementId === selectedStatementId
      ? frame.previousBackground
      : undefined;
  const transition = transitionLayer?.transition;
  const bounded = Math.min(1, Math.max(0, progress));
  const previous = images.previousBackground;
  const current = images.background;
  if (transition === "fade") {
    context.fillStyle = "#101827";
    context.fillRect(0, 0, designWidth, designHeight);
  } else if (previous === undefined) drawFallbackBackground(context, designWidth, designHeight);
  if (previous !== undefined) {
    context.save();
    context.globalAlpha = current !== undefined && transition === "fade"
      ? Math.max(0, 1 - bounded * 2)
      : current === undefined && transition !== undefined
        ? 1 - bounded
        : 1;
    if (current === undefined && transition === "slide") context.translate(-designWidth * bounded, 0);
    drawCover(context, previous, designWidth, designHeight);
    context.restore();
    context.globalAlpha = 1;
  }
  if (current === undefined) return;
  context.save();
  if (transition === "fade") context.globalAlpha = bounded < 0.5 ? 0 : (bounded - 0.5) * 2;
  else if (transition === "dissolve") context.globalAlpha = bounded;
  else context.globalAlpha = 1;
  if (transition === "slide") context.translate(designWidth * (1 - bounded), 0);
  drawCover(context, current, designWidth, designHeight);
  context.restore();
  context.globalAlpha = 1;
}

export function drawPreviewCanvasFrame(
  context: CanvasRenderingContext2D,
  frame: PreviewRenderFrame,
  images: PreviewCanvasImageSet,
  designWidth: number,
  designHeight: number,
  pixelWidth: number,
  pixelHeight: number,
  selectedStatementId: string,
  movementProgress = 1
): void {
  context.setTransform(pixelWidth / designWidth, 0, 0, pixelHeight / designHeight, 0, 0);
  context.clearRect(0, 0, designWidth, designHeight);
  const cameraTarget = resolvePreviewCameraGeometry(frame.camera);
  const camera = frame.camera?.movementFrom === undefined ? cameraTarget : interpolateCameraGeometry(frame.camera.movementFrom, cameraTarget, previewStageEasingProgress(frame.camera.easing, movementProgress));
  context.save();
  context.translate(designWidth * (0.5 + camera.x / 100), designHeight * (0.5 + camera.y / 100));
  context.rotate(camera.rotation * Math.PI / 180);
  context.scale(camera.zoom, camera.zoom);
  context.translate(-designWidth * 0.5, -designHeight * 0.5);
  drawTransitionBackgrounds(context, frame, images, designWidth, designHeight, selectedStatementId, movementProgress);
  for (const character of frame.characters) {
    const image = images.characters.get(character.statementId);
    if (image === undefined) continue;
    const targetGeometry = resolvePreviewCharacterGeometry(character);
    let geometry = character.movementFrom === undefined
      ? targetGeometry
      : interpolateGeometry(character.movementFrom, targetGeometry, previewStageEasingProgress(character.easing, movementProgress));
    if (character.entering === true && character.transition === "slide") {
      geometry = { ...geometry, x: geometry.x + 7 * (1 - Math.min(1, Math.max(0, movementProgress))) };
    }
    const rect = resolveCanvasCharacterRect(geometry, image.width, image.height, designWidth, designHeight);
    context.save();
    const boundedProgress = Math.min(1, Math.max(0, movementProgress));
    context.globalAlpha = character.exiting === true ? 1 - boundedProgress : character.entering === true ? boundedProgress : 1;
    context.translate(designWidth * geometry.x / 100, designHeight * geometry.y / 100);
    context.rotate(geometry.rotation * Math.PI / 180);
    if (selectedStatementId === character.statementId) {
      context.shadowColor = "rgba(98, 215, 255, 0.85)";
      context.shadowBlur = Math.max(8, designWidth * 0.008);
    } else {
      context.shadowColor = "rgba(0, 0, 0, 0.38)";
      context.shadowBlur = Math.max(8, designWidth * 0.01);
      context.shadowOffsetY = Math.max(4, designHeight * 0.015);
    }
    context.drawImage(image.source, rect.offsetX, rect.offsetY, rect.width, rect.height);
    context.restore();
  }
  context.restore();
}

interface PreviewCanvasHitProxyProps {
  readonly character: LoadedPreviewCharacter;
  readonly selected: boolean;
  readonly designWidth: number;
  readonly designHeight: number;
  readonly onSelect: (statementId: string) => void;
  readonly onStagePoint: (point: StageDesignPoint) => void;
}

export function PreviewCanvasHitProxy({
  character,
  selected,
  designWidth,
  designHeight,
  onSelect,
  onStagePoint
}: PreviewCanvasHitProxyProps) {
  const geometry = resolvePreviewCharacterGeometry(character);
  const movementFrom = character.movementFrom;
  const label = `选择 Stage 角色 ${character.assetId}${character.expression === undefined ? "" : `，表情 ${character.expression}`}`;
  return <button
    type="button"
    className={`stage-canvas-hit-proxy${movementFrom === undefined ? "" : " stage-canvas-hit-proxy--moving"}${character.entering === true ? ` stage-canvas-hit-proxy--entering stage-transition--${character.transition ?? "fade"}` : ""}${character.exiting === true ? " stage-canvas-hit-proxy--exiting" : ""}${selected ? " is-selected" : ""}`}
    data-testid={`preview-character-${character.slot}`}
    data-stage-slot={character.slot}
    data-stage-x={geometry.x}
    data-stage-y={geometry.y}
    data-stage-easing={character.easing ?? "linear"}
    aria-label={label}
    aria-pressed={selected}
    aria-hidden={character.exiting === true ? true : undefined}
    tabIndex={character.exiting === true ? -1 : undefined}
    disabled={character.exiting === true}
    onPointerDown={(event) => {
      event.stopPropagation();
      const stage = event.currentTarget.closest<HTMLElement>("[data-stage-surface]");
      if (stage === null) return;
      const point = mapClientPointToStage(event.clientX, event.clientY, stage.getBoundingClientRect(), designWidth, designHeight);
      if (point !== null) onStagePoint(point);
    }}
    onClick={() => onSelect(character.statementId)}
    style={{
      zIndex: character.z ?? 0,
      left: `${geometry.x}%`,
      top: `${geometry.y}%`,
      transform: `translate(${-geometry.anchorX * 100}%, ${-geometry.anchorY * 100}%) rotate(${geometry.rotation}deg)`,
      animationDuration: character.duration ?? "300ms",
      animationTimingFunction: character.easing ?? "linear",
      ...(movementFrom === undefined ? {} : {
        "--stage-move-from-left": `${movementFrom.x}%`,
        "--stage-move-from-top": `${movementFrom.y}%`,
        "--stage-move-from-transform": `translate(${-movementFrom.anchorX * 100}%, ${-movementFrom.anchorY * 100}%) rotate(${movementFrom.rotation}deg)`
      })
    } as CSSProperties}
  />;
}

interface PreviewCanvasHostProps {
  readonly frame: PreviewRenderFrame;
  readonly designWidth: number;
  readonly designHeight: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly selectedStatementId: string;
  readonly onSelect: (statementId: string) => void;
  readonly onStagePoint: (point: StageDesignPoint) => void;
  readonly onRuntimeError: (
    role: PreviewMediaRole,
    layer: { readonly statementId: string; readonly assetId: string }
  ) => void;
}

function loadCanvasImage(url: string, signal: AbortSignal): Promise<PreviewCanvasImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      image.src = "";
      finish();
      reject(new DOMException("Canvas image decode was cancelled", "AbortError"));
    };
    image.onload = () => {
      finish();
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      finish();
      reject(new Error("Canvas image decode failed"));
    };
    signal.addEventListener("abort", abort, { once: true });
    image.src = url;
  });
}

export function PreviewCanvasHost({
  frame,
  designWidth,
  designHeight,
  pixelWidth,
  pixelHeight,
  selectedStatementId,
  onSelect,
  onStagePoint,
  onRuntimeError
}: PreviewCanvasHostProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeErrorRef = useRef(onRuntimeError);
  runtimeErrorRef.current = onRuntimeError;
  const [fallback, setFallback] = useState(false);
  const activeTransition = frame.background?.statementId === selectedStatementId
    ? frame.background
    : frame.previousBackground?.statementId === selectedStatementId
      ? frame.previousBackground
      : undefined;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext("2d");
    } catch {
      setFallback(true);
      return;
    }
    if (context === null) {
      setFallback(true);
      return;
    }
    const controller = new AbortController();
    const characterImages = new Map<string, PreviewCanvasImage>();
    const imageTasks: Promise<void>[] = [];
    let animationFrame = 0;
    let movementProgress = activeTransition?.transition !== undefined || frame.camera?.movementFrom !== undefined || frame.characters.some((character) => character.entering === true || character.movementFrom !== undefined || character.exiting === true) ? 0 : 1;
    let backgroundImage: PreviewCanvasImage | undefined;
    let previousBackgroundImage: PreviewCanvasImage | undefined;
    const draw = () => {
      if (controller.signal.aborted) return;
      drawPreviewCanvasFrame(
        context,
        frame,
        {
          ...(backgroundImage === undefined ? {} : { background: backgroundImage }),
          ...(previousBackgroundImage === undefined ? {} : { previousBackground: previousBackgroundImage }),
          characters: characterImages
        },
        designWidth,
        designHeight,
        pixelWidth,
        pixelHeight,
        selectedStatementId,
        movementProgress
      );
    };
    draw();
    if (frame.background !== undefined) {
      const layer = frame.background;
      imageTasks.push(loadCanvasImage(layer.url, controller.signal).then((image) => {
        backgroundImage = image;
        draw();
      }).catch((error: unknown) => {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
          runtimeErrorRef.current("background", layer);
        }
      }));
    }
    if (frame.previousBackground !== undefined) {
      const layer = frame.previousBackground;
      imageTasks.push(loadCanvasImage(layer.url, controller.signal).then((image) => {
        previousBackgroundImage = image;
        draw();
      }).catch((error: unknown) => {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
          runtimeErrorRef.current("background", layer);
        }
      }));
    }
    for (const character of frame.characters) {
      imageTasks.push(loadCanvasImage(character.url, controller.signal).then((image) => {
        characterImages.set(character.statementId, image);
        draw();
      }).catch((error: unknown) => {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
          runtimeErrorRef.current("character", character);
        }
      }));
    }
    void Promise.allSettled(imageTasks).then(() => {
      if (controller.signal.aborted || movementProgress === 1) return;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
      const duration = Math.max(0, ...(activeTransition?.transition === undefined ? [] : [previewCanvasDurationMs(activeTransition.duration)]), ...(frame.camera?.movementFrom === undefined ? [] : [previewCanvasDurationMs(frame.camera.duration)]), ...frame.characters
        .filter((character) => character.entering === true || character.movementFrom !== undefined || character.exiting === true)
        .map((character) => previewCanvasDurationMs(character.duration)));
      if (reducedMotion || duration === 0) {
        movementProgress = 1;
        draw();
        return;
      }
      let startedAt: number | undefined;
      const animate = (timestamp: number) => {
        if (controller.signal.aborted) return;
        startedAt ??= timestamp;
        movementProgress = Math.min(1, (timestamp - startedAt) / duration);
        draw();
        if (movementProgress < 1) animationFrame = window.requestAnimationFrame(animate);
      };
      animationFrame = window.requestAnimationFrame(animate);
    });
    return () => {
      controller.abort();
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame);
    };
  }, [designHeight, designWidth, frame.generation, frame.planKey, pixelHeight, pixelWidth, selectedStatementId]);

  if (fallback) return <PreviewVisualHost
    frame={{ ...frame, backend: PREVIEW_RENDER_HOST_CAPABILITIES.fallbackBackend }}
    designWidth={designWidth}
    designHeight={designHeight}
    selectedStatementId={selectedStatementId}
    onSelect={onSelect}
    onStagePoint={onStagePoint}
    onRuntimeError={onRuntimeError}
  />;

  return <div
    className="stage-visual-host stage-canvas-host"
    data-testid="preview-visual-host"
    data-render-contract={frame.contractVersion}
    data-render-backend={frame.backend}
    data-render-status={frame.status}
    data-render-generation={frame.generation}
  >
    <canvas
      key={frame.planKey}
      ref={canvasRef}
      className="stage-canvas"
      width={pixelWidth}
      height={pixelHeight}
      role="img"
      aria-label="Canvas 2D 舞台画面"
      data-background-transition={activeTransition?.transition}
    />
    <div className="stage-canvas-hit-plane" data-camera-statement={frame.camera?.statementId} style={frame.camera === undefined ? undefined : {
      transformOrigin: "50% 50%",
      transform: `translate(${frame.camera.x}%, ${frame.camera.y}%) scale(${frame.camera.zoom}) rotate(${frame.camera.rotation}deg)`,
      transition: `transform ${frame.camera.duration ?? "360ms"} ${frame.camera.easing ?? "linear"}`
    }}>
      {frame.characters.map((character) => <PreviewCanvasHitProxy
        key={character.slot}
        character={character}
        selected={selectedStatementId === character.statementId}
        designWidth={designWidth}
        designHeight={designHeight}
        onSelect={onSelect}
        onStagePoint={onStagePoint}
      />)}
    </div>
  </div>;
}
