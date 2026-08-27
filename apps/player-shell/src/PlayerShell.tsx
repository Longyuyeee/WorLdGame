import { useEffect, useMemo, useState } from "react";
import type { CanonicalProject } from "@world-studio/project-domain";
import {
  approvePlayerCoreBarrier,
  advancePlayerCore,
  createPlayerCore,
  createPlayerCoreSnapshotV1,
  selectPlayerCoreChoice,
  settlePlayerCoreEffect,
  startPlayerCore,
  type PlayerCoreState
} from "@world-studio/player-core";
import { derivePlayerStagePresentationV1, type PlayerMediaAssetSourceV1 } from "./player-presentation-adapter";
import "./player-shell.css";

export interface PlayerShellProps {
  readonly project: CanonicalProject;
  readonly mediaAssets?: readonly PlayerMediaAssetSourceV1[];
}

function nextState(state: PlayerCoreState, project: CanonicalProject): PlayerCoreState {
  if (state.status === "title") return startPlayerCore(state, project);
  if (state.status === "presenting") return advancePlayerCore(state);
  return state;
}

export function PlayerShell({ project, mediaAssets = [] }: PlayerShellProps) {
  const [state, setState] = useState(() => createPlayerCore(project));
  const [mediaErrors, setMediaErrors] = useState<readonly string[]>([]);
  const snapshot = useMemo(() => createPlayerCoreSnapshotV1(state), [state]);
  const content = snapshot.presentation;
  const stage = useMemo(() => derivePlayerStagePresentationV1(snapshot, mediaAssets), [mediaAssets, snapshot]);
  const lastEffectOperation = snapshot.effects.operations.at(-1) ?? null;
  const speakerNames = useMemo(() => Object.fromEntries(project.characters.characters.flatMap((character) => {
    const id = typeof character.id === "string" ? character.id : undefined;
    const displayName = typeof character.displayName === "string" ? character.displayName : undefined;
    return id === undefined || displayName === undefined ? [] : [[id, displayName] as const];
  })), [project.characters.characters]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if ((event.key === "Enter" || event.key === " ") && (state.status === "title" || state.status === "presenting")) {
        event.preventDefault();
        setState((current) => nextState(current, project));
        return;
      }
      if (state.status === "waiting-choice" && /^[1-9]$/u.test(event.key) && content.kind === "choice") {
        const option = content.options[Number(event.key) - 1];
        if (option !== undefined) setState((current) => selectPlayerCoreChoice(current, option.optionId));
        return;
      }
      if (state.status === "waiting-effect" && event.key === "Escape") {
        event.preventDefault();
        setState((current) => settlePlayerCoreEffect(current, "cancel"));
      } else if (state.status === "waiting-barrier" && event.key === "Enter") {
        event.preventDefault();
        setState((current) => approvePlayerCoreBarrier(current));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [content, project, state.status]);

  return (
    <main
      className="player-shell"
      data-player-status={snapshot.status}
      data-player-core={snapshot.playerCoreVersion}
      data-compiler={snapshot.identities.compilerVersion}
      data-runtime={snapshot.identities.runtimeVersion}
      data-runtime-host={snapshot.identities.runtimeHostVersion}
      data-effect-operation={lastEffectOperation?.kind ?? "none"}
    >
      <div className="player-glow player-glow--violet" />
      <div className="player-glow player-glow--cyan" />
      <section className="player-stage" aria-label={`${snapshot.title} 游戏画面`}>
        <div className="player-stage-world" style={{ transform: stage.cameraTransform }} aria-label="正式媒体舞台">
          {stage.background !== null && (
            <img
              className={`player-stage-background player-transition--${stage.background.transition}`}
              src={stage.background.url}
              alt={stage.background.displayName}
              data-asset-id={stage.background.assetId}
              onError={() => setMediaErrors((current) => [...new Set([...current, stage.background!.assetId])])}
            />
          )}
          {stage.background === null && stage.sceneDescription !== null && (
            <div className="player-scene-description" aria-label="场景描述">{stage.sceneDescription}</div>
          )}
          {stage.characters.map((character) => (
            <img
              key={`${character.slot}:${character.assetId}`}
              className={`player-stage-character player-transition--${character.transition}`}
              src={character.url}
              alt={character.displayName}
              data-asset-id={character.assetId}
              data-stage-slot={character.slot}
              style={{ left: `${character.x}%`, top: `${character.y}%`, zIndex: character.z, transform: `translate(-50%, -100%) scale(${character.scale})` }}
              onError={() => setMediaErrors((current) => [...new Set([...current, character.assetId])])}
            />
          ))}
        </div>
        {stage.audio.map((track) => (
          <audio
            key={`${track.bus}:${track.assetId}`}
            ref={(element) => {
              if (element !== null) {
                element.volume = track.volume;
                element.dataset.appliedVolume = String(element.volume);
              }
            }}
            src={track.url}
            data-audio-bus={track.bus}
            data-asset-id={track.assetId}
            data-volume={track.volume}
            aria-label={`${track.displayName} · ${track.bus}`}
            autoPlay={track.status === "playing"}
            loop={track.loop}
            onError={() => setMediaErrors((current) => [...new Set([...current, track.assetId])])}
          />
        ))}
        <header className="player-brand" aria-label="播放器状态">
          <span className="player-brand__mark" aria-hidden="true">W</span>
          <span>WorLd Player</span>
          <span className="player-brand__status">{snapshot.status}</span>
          {lastEffectOperation !== null && <span className="player-brand__effect">FX {lastEffectOperation.sequence + 1} · {lastEffectOperation.kind}</span>}
        </header>

        {(stage.missingAssetIds.length > 0 || mediaErrors.length > 0) && (
          <div className="player-media-error" role="alert">
            媒体未能安全呈现：{[...new Set([...stage.missingAssetIds, ...mediaErrors])].join("、")}
          </div>
        )}

        {content.kind === "title" && (
          <div className="player-title-screen">
            <p className="player-eyebrow">A WORLd STUDIO STORY</p>
            <h1>{snapshot.title}</h1>
            <p>同一个故事核心，面向每一块屏幕。</p>
            <button className="player-primary" type="button" onClick={() => setState((current) => nextState(current, project))}>
              开始故事
              <span aria-hidden="true">→</span>
            </button>
            <span className="player-hint">Enter / Space</span>
          </div>
        )}

        {(content.kind === "dialogue" || content.kind === "narration") && (
          <button className={`player-dialogue player-dialogue--${stage.textboxTemplate}`} type="button" onClick={() => setState((current) => nextState(current, project))} aria-label="继续下一句">
            {content.kind === "dialogue" && <strong>{speakerNames[content.speakerId] ?? content.speakerId}</strong>}
            <span aria-live="polite">{content.text}</span>
            <i aria-hidden="true">⌄</i>
          </button>
        )}

        {content.kind === "choice" && (
          <div className="player-choice" role="group" aria-labelledby="player-choice-prompt">
            <p id="player-choice-prompt">{content.prompt}</p>
            {content.options.map((option, index) => (
              <button key={option.optionId} type="button" onClick={() => setState((current) => selectPlayerCoreChoice(current, option.optionId))}>
                <span aria-hidden="true">{index + 1}</span>{option.label}
              </button>
            ))}
          </div>
        )}

        {content.kind === "ending" && (
          <div className="player-ending" role="status">
            <span>ENDING</span>
            <h2>{content.name}</h2>
          </div>
        )}

        {content.kind === "error" && (
          <div className="player-error" role="alert">
            <span>无法安全启动</span>
            <h1>{snapshot.title}</h1>
            <p>{content.diagnostics[0]?.message ?? "未知 Player Core 错误"}</p>
            <code>{content.diagnostics[0]?.code ?? "PLAYER_UNKNOWN_ERROR"}</code>
          </div>
        )}

        {content.kind === "effect" && (
          <div className="player-boundary" role="status" aria-label={`正在呈现动效 ${content.descriptorId}`}>
            <span>正式 Runtime Host</span>
            <strong>正在呈现动效</strong>
            <code>{content.descriptorId}</code>
            <div
              key={snapshot.effects.pending?.effectId}
              className="player-effect-progress"
              data-testid="player-effect-progress"
              style={{ animationDuration: `${stage.pendingDurationMilliseconds}ms` }}
              onAnimationEnd={() => {
                if (stage.missingAssetIds.length === 0 && mediaErrors.length === 0) setState((current) => settlePlayerCoreEffect(current, "complete"));
              }}
            />
            <div className="player-boundary__actions">
              <button type="button" disabled={stage.missingAssetIds.length > 0 || mediaErrors.length > 0} onClick={() => setState((current) => settlePlayerCoreEffect(current, "complete"))}>完成动效</button>
              {content.canCancel && <button type="button" onClick={() => setState((current) => settlePlayerCoreEffect(current, "cancel"))}>跳过动效</button>}
            </div>
          </div>
        )}

        {content.kind === "barrier" && (
          <div className="player-boundary" role="alertdialog" aria-label={`确认不可逆步骤 ${content.descriptorId}`}>
            <span>不可逆边界</span><strong>{content.reason}</strong><code>{content.descriptorId}</code>
            <button type="button" onClick={() => setState((current) => approvePlayerCoreBarrier(current))}>确认继续</button>
          </div>
        )}

        {content.kind === "wait" && <div className="player-boundary" role="status">等待 {content.durationMilliseconds}ms</div>}
      </section>
    </main>
  );
}
