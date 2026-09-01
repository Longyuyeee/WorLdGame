import type { LoadedPreviewMedia } from "./preview-media-runtime";

export type PreviewMediaRole = "background" | "character" | "audio";

export interface PreviewRuntimeMediaError {
  readonly role: PreviewMediaRole;
  readonly statementId: string;
  readonly assetId: string;
  readonly code: "decode-failed";
}

export type PreviewMediaHostState =
  | {
      readonly status: "loading";
      readonly generation: number;
      readonly planKey: string;
      readonly runtimeErrors: readonly PreviewRuntimeMediaError[];
    }
  | {
      readonly status: "ready";
      readonly generation: number;
      readonly planKey: string;
      readonly media: LoadedPreviewMedia;
      readonly runtimeErrors: readonly PreviewRuntimeMediaError[];
    };

export type PreviewMediaHostAction =
  | { readonly type: "begin"; readonly generation: number; readonly planKey: string }
  | { readonly type: "ready"; readonly generation: number; readonly planKey: string; readonly media: LoadedPreviewMedia }
  | { readonly type: "failed"; readonly generation: number; readonly planKey: string; readonly errors: readonly string[] }
  | { readonly type: "runtime-error"; readonly generation: number; readonly planKey: string; readonly error: PreviewRuntimeMediaError };

const MAX_RUNTIME_MEDIA_ERRORS = 100;

export function createPreviewMediaHostState(planKey: string): PreviewMediaHostState {
  return { status: "loading", generation: 0, planKey, runtimeErrors: [] };
}

function matchesActiveRequest(
  state: PreviewMediaHostState,
  action: { readonly generation: number; readonly planKey: string }
): boolean {
  return state.generation === action.generation && state.planKey === action.planKey;
}

function runtimeErrorKey(error: PreviewRuntimeMediaError): string {
  return `${error.role}:${error.statementId}:${error.assetId}:${error.code}`;
}

export function reducePreviewMediaHost(
  state: PreviewMediaHostState,
  action: PreviewMediaHostAction
): PreviewMediaHostState {
  switch (action.type) {
    case "begin":
      if (action.generation <= state.generation) return state;
      return {
        status: "loading",
        generation: action.generation,
        planKey: action.planKey,
        runtimeErrors: []
      };
    case "ready":
      if (!matchesActiveRequest(state, action) || action.media.planKey !== action.planKey) return state;
      return { ...state, status: "ready", media: action.media };
    case "failed":
      if (!matchesActiveRequest(state, action)) return state;
      return {
        ...state,
        status: "ready",
        media: {
          planKey: action.planKey,
          characters: [],
          audio: [],
          errors: [...action.errors],
          objectUrls: []
        }
      };
    case "runtime-error": {
      if (!matchesActiveRequest(state, action) || state.status !== "ready") return state;
      const key = runtimeErrorKey(action.error);
      if (state.runtimeErrors.some((error) => runtimeErrorKey(error) === key)) return state;
      if (state.runtimeErrors.length >= MAX_RUNTIME_MEDIA_ERRORS) return state;
      return { ...state, runtimeErrors: [...state.runtimeErrors, action.error] };
    }
  }
}

export function previewMediaLayerFailed(
  state: PreviewMediaHostState,
  role: PreviewMediaRole,
  statementId: string,
  assetId: string
): boolean {
  return state.runtimeErrors.some((error) =>
    error.role === role && error.statementId === statementId && error.assetId === assetId
  );
}

export function previewMediaErrorCount(state: PreviewMediaHostState): number {
  return (state.status === "ready" ? state.media.errors.length : 0) + state.runtimeErrors.length;
}
