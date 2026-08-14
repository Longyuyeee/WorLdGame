import type { LoadedPreviewMedia } from "./preview-media-runtime";
import {
  previewMediaErrorCount,
  previewMediaLayerFailed,
  type PreviewMediaHostState
} from "./preview-media-host";

export const PREVIEW_RENDER_HOST_CONTRACT_VERSION = 1;

export const PREVIEW_RENDER_HOST_CAPABILITIES = Object.freeze({
  backend: "dom-media-v1",
  coordinateSpace: "design-pixels",
  visualPlanes: ["background", "character"] as const,
  overlayOwner: "react-dom",
  hitTesting: "accessible-dom-proxy"
});

export interface PreviewRenderFrame {
  readonly contractVersion: typeof PREVIEW_RENDER_HOST_CONTRACT_VERSION;
  readonly backend: typeof PREVIEW_RENDER_HOST_CAPABILITIES.backend;
  readonly status: "loading" | "ready";
  readonly generation: number;
  readonly planKey: string;
  readonly background?: LoadedPreviewMedia["background"];
  readonly characters: LoadedPreviewMedia["characters"];
  readonly errorCount: number;
}

export function createPreviewRenderFrame(
  host: PreviewMediaHostState,
  activePlanKey: string
): PreviewRenderFrame {
  const active = host.planKey === activePlanKey && host.status === "ready";
  if (!active) {
    return {
      contractVersion: PREVIEW_RENDER_HOST_CONTRACT_VERSION,
      backend: PREVIEW_RENDER_HOST_CAPABILITIES.backend,
      status: "loading",
      generation: host.generation,
      planKey: activePlanKey,
      characters: [],
      errorCount: 0
    };
  }
  const background = host.media.background;
  const backgroundAvailable = background !== undefined && !previewMediaLayerFailed(
    host,
    "background",
    background.statementId,
    background.assetId
  );
  return {
    contractVersion: PREVIEW_RENDER_HOST_CONTRACT_VERSION,
    backend: PREVIEW_RENDER_HOST_CAPABILITIES.backend,
    status: "ready",
    generation: host.generation,
    planKey: activePlanKey,
    ...(backgroundAvailable ? { background } : {}),
    characters: host.media.characters.filter((character) => !previewMediaLayerFailed(
      host,
      "character",
      character.statementId,
      character.assetId
    )),
    errorCount: previewMediaErrorCount(host)
  };
}
