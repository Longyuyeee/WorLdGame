import type { CSSProperties } from "react";
import { resolvePreviewCharacterGeometry, type LoadedPreviewMedia } from "./preview-media-runtime";
import type { PreviewMediaRole } from "./preview-media-host";
import type { PreviewRenderFrame } from "./preview-render-host";
import { mapClientPointToStage, type StageDesignPoint } from "./stage-surface";

type LoadedPreviewCharacter = LoadedPreviewMedia["characters"][number];

interface PreviewStageCharacterProps {
  readonly character: LoadedPreviewCharacter;
  readonly selected: boolean;
  readonly designWidth: number;
  readonly designHeight: number;
  readonly onSelect: (statementId: string) => void;
  readonly onStagePoint: (point: StageDesignPoint) => void;
  readonly onDecodeError: () => void;
}

export function PreviewStageCharacter({
  character,
  selected,
  designWidth,
  designHeight,
  onSelect,
  onStagePoint,
  onDecodeError
}: PreviewStageCharacterProps) {
  const geometry = resolvePreviewCharacterGeometry(character);
  const movementFrom = character.movementFrom;
  const hasTransition = character.entering === true || movementFrom !== undefined;
  const label = `选择 Stage 角色 ${character.assetId}${character.expression === undefined ? "" : `，表情 ${character.expression}`}`;
  return <button
    type="button"
    className={`stage-media-character${hasTransition ? ` stage-transition--${character.transition ?? "slide"}` : ""}${character.entering === true ? " stage-media-character--entering" : ""}${movementFrom === undefined ? "" : " stage-media-character--moving"}${character.exiting === true ? " stage-media-character--exiting" : ""}${selected ? " is-selected" : ""}`}
    data-testid={`preview-character-${character.slot}`}
    data-stage-slot={character.slot}
    data-stage-x={geometry.x}
    data-stage-y={geometry.y}
    data-stage-scale={geometry.scale}
    data-stage-rotation={geometry.rotation}
    data-stage-anchor={`${geometry.anchorX},${geometry.anchorY}`}
    data-stage-easing={character.easing ?? "linear"}
    aria-label={label}
    aria-pressed={selected}
    aria-hidden={character.exiting === true ? true : undefined}
    tabIndex={character.exiting === true ? -1 : undefined}
    disabled={character.exiting === true}
    onPointerDown={(event) => {
      const stage = event.currentTarget.closest<HTMLElement>("[data-stage-surface]");
      if (stage === null) return;
      const point = mapClientPointToStage(
        event.clientX,
        event.clientY,
        stage.getBoundingClientRect(),
        designWidth,
        designHeight
      );
      if (point !== null) onStagePoint(point);
    }}
    onClick={() => onSelect(character.statementId)}
    style={{
      animationDuration: character.duration ?? "360ms",
      animationTimingFunction: character.easing ?? "linear",
      zIndex: character.z ?? 0,
      left: `${geometry.x}%`,
      top: `${geometry.y}%`,
      right: "auto",
      bottom: "auto",
      transform: `translate(${-geometry.anchorX * 100}%, ${-geometry.anchorY * 100}%) scale(${geometry.scale}) rotate(${geometry.rotation}deg)`,
      transformOrigin: `${geometry.anchorX * 100}% ${geometry.anchorY * 100}%`,
      ...(movementFrom === undefined ? {} : {
        "--stage-move-from-left": `${movementFrom.x}%`,
        "--stage-move-from-top": `${movementFrom.y}%`,
        "--stage-move-from-transform": `translate(${-movementFrom.anchorX * 100}%, ${-movementFrom.anchorY * 100}%) scale(${movementFrom.scale}) rotate(${movementFrom.rotation}deg)`
      })
    } as CSSProperties}
  >
    <img
      src={character.url}
      alt={`角色资源 ${character.assetId}${character.expression === undefined ? "" : ` · ${character.expression}`}`}
      draggable={false}
      onError={onDecodeError}
    />
  </button>;
}

interface PreviewVisualHostProps {
  readonly frame: PreviewRenderFrame;
  readonly designWidth: number;
  readonly designHeight: number;
  readonly selectedStatementId: string;
  readonly onSelect: (statementId: string) => void;
  readonly onStagePoint: (point: StageDesignPoint) => void;
  readonly onRuntimeError: (
    role: PreviewMediaRole,
    layer: { readonly statementId: string; readonly assetId: string }
  ) => void;
}

export function PreviewVisualHost({
  frame,
  designWidth,
  designHeight,
  selectedStatementId,
  onSelect,
  onStagePoint,
  onRuntimeError
}: PreviewVisualHostProps) {
  return <div
    className="stage-visual-host"
    data-testid="preview-visual-host"
    data-render-contract={frame.contractVersion}
    data-render-backend={frame.backend}
    data-render-status={frame.status}
    data-render-generation={frame.generation}
  >
    <div className="stage-background-plane" aria-hidden={frame.background === undefined ? "true" : undefined}>
      {frame.background === undefined ? (
        <div className="stage-sky" aria-hidden="true">
          <span className="sun" /><span className="school-building" />
          <span className="character-silhouette character-silhouette--left" />
          <span className="character-silhouette character-silhouette--right" />
        </div>
      ) : (
        <img
          className={`stage-media-background stage-transition--${frame.background.transition ?? "none"}`}
          data-testid="preview-background"
          src={frame.background.url}
          alt={`背景资源 ${frame.background.assetId}`}
          style={{ animationDuration: frame.background.duration ?? "360ms" } as CSSProperties}
          onError={() => onRuntimeError("background", frame.background!)}
        />
      )}
    </div>
    <div className="stage-character-plane" data-layer-count={frame.characters.length}>
      {frame.characters.map((character) => <PreviewStageCharacter
        key={character.slot}
        character={character}
        selected={selectedStatementId === character.statementId}
        designWidth={designWidth}
        designHeight={designHeight}
        onSelect={onSelect}
        onStagePoint={onStagePoint}
        onDecodeError={() => onRuntimeError("character", character)}
      />)}
    </div>
  </div>;
}
