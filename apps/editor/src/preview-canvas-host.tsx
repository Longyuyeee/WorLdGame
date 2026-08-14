import { useEffect, useRef, useState, type CSSProperties } from "react";
import { resolvePreviewCharacterGeometry, type LoadedPreviewMedia } from "./preview-media-runtime";
import type { PreviewMediaRole } from "./preview-media-host";
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

export function drawPreviewCanvasFrame(
  context: CanvasRenderingContext2D,
  frame: PreviewRenderFrame,
  images: PreviewCanvasImageSet,
  designWidth: number,
  designHeight: number,
  pixelWidth: number,
  pixelHeight: number,
  selectedStatementId: string
): void {
  context.setTransform(pixelWidth / designWidth, 0, 0, pixelHeight / designHeight, 0, 0);
  context.clearRect(0, 0, designWidth, designHeight);
  if (frame.background !== undefined && images.background !== undefined) {
    drawCover(context, images.background, designWidth, designHeight);
  } else {
    const gradient = context.createLinearGradient(0, 0, 0, designHeight);
    gradient.addColorStop(0, "#715fae");
    gradient.addColorStop(0.66, "#efb26e");
    gradient.addColorStop(0.67, "#253149");
    context.fillStyle = gradient;
    context.fillRect(0, 0, designWidth, designHeight);
  }
  for (const character of frame.characters) {
    const image = images.characters.get(character.statementId);
    if (image === undefined) continue;
    const geometry = resolvePreviewCharacterGeometry(character);
    const rect = resolvePreviewCanvasCharacterRect(character, image.width, image.height, designWidth, designHeight);
    context.save();
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
  const label = `选择 Stage 角色 ${character.assetId}${character.expression === undefined ? "" : `，表情 ${character.expression}`}`;
  return <button
    type="button"
    className={`stage-canvas-hit-proxy${selected ? " is-selected" : ""}`}
    data-testid={`preview-character-${character.slot}`}
    data-stage-slot={character.slot}
    data-stage-x={geometry.x}
    data-stage-y={geometry.y}
    aria-label={label}
    aria-pressed={selected}
    onPointerDown={(event) => {
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
      transform: `translate(${-geometry.anchorX * 100}%, ${-geometry.anchorY * 100}%) rotate(${geometry.rotation}deg)`
    }}
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
  const activeTransition = [...frame.characters].reverse().find((item) => item.transition !== undefined) ?? frame.background;

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
    let backgroundImage: PreviewCanvasImage | undefined;
    const draw = () => {
      if (controller.signal.aborted) return;
      drawPreviewCanvasFrame(
        context,
        frame,
        { ...(backgroundImage === undefined ? {} : { background: backgroundImage }), characters: characterImages },
        designWidth,
        designHeight,
        pixelWidth,
        pixelHeight,
        selectedStatementId
      );
    };
    draw();
    if (frame.background !== undefined) {
      const layer = frame.background;
      void loadCanvasImage(layer.url, controller.signal).then((image) => {
        backgroundImage = image;
        draw();
      }).catch((error: unknown) => {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
          runtimeErrorRef.current("background", layer);
        }
      });
    }
    for (const character of frame.characters) {
      void loadCanvasImage(character.url, controller.signal).then((image) => {
        characterImages.set(character.statementId, image);
        draw();
      }).catch((error: unknown) => {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
          runtimeErrorRef.current("character", character);
        }
      });
    }
    return () => controller.abort();
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
      className={`stage-canvas${activeTransition?.transition === undefined ? "" : ` stage-transition--${activeTransition.transition}`}`}
      width={pixelWidth}
      height={pixelHeight}
      role="img"
      aria-label="Canvas 2D 舞台画面"
      style={{ animationDuration: activeTransition?.duration ?? "360ms" } as CSSProperties}
    />
    <div className="stage-canvas-hit-plane">
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
