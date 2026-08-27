import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { CanonicalProject } from "@world-studio/project-domain";
import type { PlayerCoreStatus } from "@world-studio/player-core";
import { WebPlayerHost } from "./player-host";
import type { PlayerHostActivityV1 } from "./PlayerShell";
import type { PlayerMediaAssetSourceV1 } from "./player-presentation-adapter";

export const WORLD_PLAYER_EMBED_API_VERSION = "1.0.0" as const;

export interface WorldPlayerMountOptionsV1 {
  readonly project: CanonicalProject;
  readonly mediaAssets?: readonly PlayerMediaAssetSourceV1[];
  readonly hostActivity?: PlayerHostActivityV1;
  readonly onRetryMedia?: () => void;
}

export interface WorldPlayerObservationV1 {
  readonly schemaVersion: 1;
  readonly embedApiVersion: typeof WORLD_PLAYER_EMBED_API_VERSION;
  readonly mounted: true;
  readonly status: PlayerCoreStatus;
  readonly hostActivity: PlayerHostActivityV1;
  readonly playerCoreVersion: string;
  readonly compilerVersion: string;
  readonly runtimeVersion: string;
  readonly runtimeHostVersion: string;
}

export interface WorldPlayerHandleV1 {
  readonly apiVersion: typeof WORLD_PLAYER_EMBED_API_VERSION;
  setProject(project: CanonicalProject): void;
  setMediaAssets(mediaAssets: readonly PlayerMediaAssetSourceV1[]): void;
  setHostActivity(activity: PlayerHostActivityV1): void;
  getObservation(): WorldPlayerObservationV1;
  unmount(): void;
}

interface ResolvedWorldPlayerMountOptionsV1 {
  readonly project: CanonicalProject;
  readonly mediaAssets: readonly PlayerMediaAssetSourceV1[];
  readonly hostActivity: PlayerHostActivityV1;
  readonly onRetryMedia: (() => void) | undefined;
}

const mountedContainers = new WeakMap<HTMLElement, WorldPlayerHandleV1>();

function requiredAttribute(element: HTMLElement, name: string): string {
  const value = element.dataset[name];
  if (value === undefined) throw new Error(`WORLD_PLAYER_OBSERVATION_MISSING:${name}`);
  return value;
}

export function mountWorldPlayerV1(container: HTMLElement, initial: WorldPlayerMountOptionsV1): WorldPlayerHandleV1 {
  if (!container.isConnected) throw new Error("WORLD_PLAYER_HOST_CONTAINER_DETACHED");
  if (mountedContainers.has(container)) throw new Error("WORLD_PLAYER_HOST_ALREADY_MOUNTED");

  const root: Root = createRoot(container);
  let disposed = false;
  let options: ResolvedWorldPlayerMountOptionsV1 = {
      project: initial.project,
      mediaAssets: initial.mediaAssets ?? [],
      hostActivity: initial.hostActivity ?? "active",
      onRetryMedia: initial.onRetryMedia
    };

  const assertActive = () => {
    if (disposed) throw new Error("WORLD_PLAYER_HOST_DISPOSED");
  };
  const render = () => {
    assertActive();
    flushSync(() => root.render(
      <WebPlayerHost
        project={options.project}
        mediaAssets={options.mediaAssets}
        activityOverride={options.hostActivity}
        {...(options.onRetryMedia === undefined ? {} : { onRetryMedia: options.onRetryMedia })}
      />
    ));
  };

  const handle: WorldPlayerHandleV1 = {
    apiVersion: WORLD_PLAYER_EMBED_API_VERSION,
    setProject(project) {
      options = { ...options, project };
      render();
    },
    setMediaAssets(mediaAssets) {
      options = { ...options, mediaAssets };
      render();
    },
    setHostActivity(hostActivity) {
      options = { ...options, hostActivity };
      render();
    },
    getObservation() {
      assertActive();
      const shell = container.querySelector<HTMLElement>("[data-player-status]");
      if (shell === null) throw new Error("WORLD_PLAYER_OBSERVATION_UNAVAILABLE");
      return {
        schemaVersion: 1,
        embedApiVersion: WORLD_PLAYER_EMBED_API_VERSION,
        mounted: true,
        status: requiredAttribute(shell, "playerStatus") as PlayerCoreStatus,
        hostActivity: requiredAttribute(shell, "hostActivity") as PlayerHostActivityV1,
        playerCoreVersion: requiredAttribute(shell, "playerCore"),
        compilerVersion: requiredAttribute(shell, "compiler"),
        runtimeVersion: requiredAttribute(shell, "runtime"),
        runtimeHostVersion: requiredAttribute(shell, "runtimeHost")
      };
    },
    unmount() {
      if (disposed) return;
      flushSync(() => root.unmount());
      disposed = true;
      mountedContainers.delete(container);
    }
  };

  mountedContainers.set(container, handle);
  try {
    render();
  } catch (error) {
    mountedContainers.delete(container);
    root.unmount();
    disposed = true;
    throw error;
  }
  return handle;
}
