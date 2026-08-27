import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { semanticHash, type CanonicalProject } from "@world-studio/project-domain";
import {
  createPlayerCore,
  createPlayerCoreSnapshotV1,
  dispatchPlayerCoreIntentV1,
  type PlayerCoreIntentV1
} from "@world-studio/player-core";
import { derivePlayerStagePresentationV1, type PlayerMediaAssetSourceV1 } from "./player-presentation-adapter";
import { browserGamepadFrameV1, createEmptyPlayerGamepadFrameV1, playerGamepadActionV1 } from "./player-input";
import "./player-shell.css";

export interface PlayerShellProps {
  readonly project: CanonicalProject;
  readonly mediaAssets?: readonly PlayerMediaAssetSourceV1[];
  readonly onRetryMedia?: () => void;
  readonly hostActivity?: PlayerHostActivityV1;
}

type PlayerInputSource = "lifecycle" | "pointer" | "keyboard" | "gamepad" | "system";
export type PlayerHostActivityV1 = "active" | "suspended";

export function PlayerShell({ project, mediaAssets = [], onRetryMedia, hostActivity = "active" }: PlayerShellProps) {
  const [state, setState] = useState(() => createPlayerCore(project));
  const [mediaErrors, setMediaErrors] = useState<readonly string[]>([]);
  const [mediaGeneration, setMediaGeneration] = useState(0);
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState(0);
  const [lastInputSource, setLastInputSource] = useState<PlayerInputSource>("lifecycle");
  const choiceButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const audioElements = useRef(new Map<string, HTMLAudioElement>());
  const previousHostActivity = useRef(hostActivity);
  const projectSemanticHash = useMemo(() => semanticHash(project), [project]);
  const snapshot = useMemo(() => createPlayerCoreSnapshotV1(state), [state]);
  const content = snapshot.presentation;
  const stage = useMemo(() => derivePlayerStagePresentationV1(snapshot, mediaAssets), [mediaAssets, snapshot]);
  const mediaSignature = useMemo(() => mediaAssets.map((asset) => `${asset.assetId}\0${asset.mimeType}\0${asset.url}`).join("\x01"), [mediaAssets]);
  const lastEffectOperation = snapshot.effects.operations.at(-1) ?? null;
  const speakerNames = useMemo(() => Object.fromEntries(project.characters.characters.flatMap((character) => {
    const id = typeof character.id === "string" ? character.id : undefined;
    const displayName = typeof character.displayName === "string" ? character.displayName : undefined;
    return id === undefined || displayName === undefined ? [] : [[id, displayName] as const];
  })), [project.characters.characters]);

  const applyIntent = useCallback((intent: PlayerCoreIntentV1, source: PlayerInputSource) => {
    setLastInputSource(source);
    setState((current) => dispatchPlayerCoreIntentV1(current, project, intent));
  }, [projectSemanticHash]);

  useEffect(() => {
    setState(createPlayerCore(project));
    setMediaErrors([]);
    setMediaGeneration(0);
    setSelectedChoiceIndex(0);
    setLastInputSource("lifecycle");
  }, [projectSemanticHash]);

  useEffect(() => {
    setMediaErrors([]);
  }, [mediaSignature]);

  useEffect(() => {
    if (content.kind !== "choice") {
      setSelectedChoiceIndex(0);
      return;
    }
    setSelectedChoiceIndex((current) => Math.min(current, Math.max(0, content.options.length - 1)));
  }, [content.kind, content.kind === "choice" ? content.options.length : 0]);

  useEffect(() => {
    if (content.kind === "choice") choiceButtons.current[selectedChoiceIndex]?.focus();
  }, [content.kind, selectedChoiceIndex]);

  useEffect(() => {
    if (hostActivity !== "active") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (content.kind === "choice" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        const delta = event.key === "ArrowUp" ? -1 : 1;
        setSelectedChoiceIndex((current) => (current + delta + content.options.length) % content.options.length);
        return;
      }
      if (content.kind === "choice" && /^[1-9]$/u.test(event.key)) {
        const option = content.options[Number(event.key) - 1];
        if (option !== undefined) applyIntent({ kind: "select-choice", optionId: option.optionId }, "keyboard");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        applyIntent({ kind: "cancel" }, "keyboard");
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const selected = content.kind === "choice" ? content.options[selectedChoiceIndex] : undefined;
        applyIntent(selected === undefined ? { kind: "primary" } : { kind: "select-choice", optionId: selected.optionId }, "keyboard");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyIntent, content, hostActivity, selectedChoiceIndex]);

  useEffect(() => {
    if (hostActivity !== "active") return;
    if (typeof navigator.getGamepads !== "function") return;
    let animationFrame = 0;
    let previous = createEmptyPlayerGamepadFrameV1();
    const poll = () => {
      const gamepad = navigator.getGamepads().find((candidate) => candidate !== null);
      if (gamepad !== undefined && gamepad !== null) {
        const current = browserGamepadFrameV1(gamepad);
        const action = playerGamepadActionV1(previous, current);
        previous = current;
        if (action === "previous-choice" || action === "next-choice") {
          if (content.kind === "choice") {
            const delta = action === "previous-choice" ? -1 : 1;
            setSelectedChoiceIndex((index) => (index + delta + content.options.length) % content.options.length);
            setLastInputSource("gamepad");
          }
        } else if (action === "primary") {
          const selected = content.kind === "choice" ? content.options[selectedChoiceIndex] : undefined;
          applyIntent(selected === undefined ? { kind: "primary" } : { kind: "select-choice", optionId: selected.optionId }, "gamepad");
        } else if (action === "cancel") {
          applyIntent({ kind: "cancel" }, "gamepad");
        }
      } else {
        previous = createEmptyPlayerGamepadFrameV1();
      }
      animationFrame = requestAnimationFrame(poll);
    };
    animationFrame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(animationFrame);
  }, [applyIntent, content, hostActivity, selectedChoiceIndex]);

  useEffect(() => {
    const previous = previousHostActivity.current;
    previousHostActivity.current = hostActivity;
    if (previous === hostActivity) return;
    for (const element of audioElements.current.values()) {
      if (hostActivity === "suspended") {
        element.dataset.playerPlayback = "suspended";
        element.pause();
      } else if (element.dataset.shouldPlay === "true") {
        element.dataset.playerPlayback = "resuming";
        const resumed = element.play();
        resumed?.then(() => {
          element.dataset.playerPlayback = "playing";
        }).catch(() => {
          element.dataset.playerPlayback = "blocked";
        });
      }
    }
  }, [hostActivity]);

  useEffect(() => () => {
    for (const element of audioElements.current.values()) {
      if (!element.paused) element.pause();
    }
  }, []);

  return (
    <main
      className="player-shell"
      data-player-status={snapshot.status}
      data-player-core={snapshot.playerCoreVersion}
      data-compiler={snapshot.identities.compilerVersion}
      data-runtime={snapshot.identities.runtimeVersion}
      data-runtime-host={snapshot.identities.runtimeHostVersion}
      data-effect-operation={lastEffectOperation?.kind ?? "none"}
      data-input-source={lastInputSource}
      data-host-activity={hostActivity}
    >
      <div className="player-glow player-glow--violet" />
      <div className="player-glow player-glow--cyan" />
      <section className="player-stage" aria-label={`${snapshot.title} 游戏画面`}>
        <div className="player-stage-world" style={{ transform: stage.cameraTransform }} aria-label="正式媒体舞台">
          {stage.background !== null && (
            <img
              key={`${mediaGeneration}:background:${stage.background.assetId}`}
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
              key={`${mediaGeneration}:${character.slot}:${character.assetId}`}
              className={`player-stage-character player-transition--${character.transition}`}
              src={character.url}
              alt={character.displayName}
              data-asset-id={character.assetId}
              data-stage-slot={character.slot}
              style={{ left: `${character.x}%`, top: `${character.y}%`, zIndex: character.z, transform: `translate(${-character.anchorX * 100}%, ${-character.anchorY * 100}%) scale(${character.scale}) rotate(${character.rotation}deg)` }}
              onError={() => setMediaErrors((current) => [...new Set([...current, character.assetId])])}
            />
          ))}
        </div>
        {stage.audio.map((track) => (
          <audio
            key={`${mediaGeneration}:${track.bus}:${track.assetId}`}
            ref={(element) => {
              if (element !== null) {
                audioElements.current.set(track.bus, element);
                element.volume = track.volume;
                element.dataset.appliedVolume = String(element.volume);
                element.dataset.shouldPlay = String(track.status === "playing");
                element.dataset.playerPlayback = hostActivity === "suspended" ? "suspended" : track.status;
              } else audioElements.current.delete(track.bus);
            }}
            src={track.url}
            data-audio-bus={track.bus}
            data-asset-id={track.assetId}
            data-volume={track.volume}
            aria-label={`${track.displayName} · ${track.bus}`}
            autoPlay={hostActivity === "active" && track.status === "playing"}
            loop={track.loop}
            onError={() => setMediaErrors((current) => [...new Set([...current, track.assetId])])}
          />
        ))}
        {hostActivity === "suspended" && (
          <div className="player-host-suspended" role="status" aria-live="polite">
            <span>PLAYER PAUSED</span>
            <strong>宿主已暂停</strong>
            <p>剧情状态已冻结，返回应用后继续。</p>
          </div>
        )}
        <header className="player-brand" aria-label="播放器状态">
          <span className="player-brand__mark" aria-hidden="true">W</span>
          <span>WorLd Player</span>
          <span className="player-brand__status">{snapshot.status}</span>
          {lastEffectOperation !== null && <span className="player-brand__effect">FX {lastEffectOperation.sequence + 1} · {lastEffectOperation.kind}</span>}
        </header>

        {(stage.missingAssetIds.length > 0 || mediaErrors.length > 0) && (
          <div className="player-media-error" role="alert">
            <span>媒体未能安全呈现：{[...new Set([...stage.missingAssetIds, ...mediaErrors])].join("、")}</span>
            <button type="button" onClick={() => {
              setMediaErrors([]);
              setMediaGeneration((current) => current + 1);
              onRetryMedia?.();
            }}>重试媒体</button>
          </div>
        )}

        {content.kind === "title" && (
          <div className="player-title-screen">
            <p className="player-eyebrow">A WORLd STUDIO STORY</p>
            <h1>{snapshot.title}</h1>
            <p>同一个故事核心，面向每一块屏幕。</p>
            <button className="player-primary" type="button" onClick={() => applyIntent({ kind: "primary" }, "pointer")}>
              开始故事
              <span aria-hidden="true">→</span>
            </button>
            <span className="player-hint">Enter / Space</span>
          </div>
        )}

        {(content.kind === "dialogue" || content.kind === "narration") && (
          <button className={`player-dialogue player-dialogue--${stage.textboxTemplate}`} type="button" onClick={() => applyIntent({ kind: "primary" }, "pointer")} aria-label="继续下一句">
            {content.kind === "dialogue" && <strong>{speakerNames[content.speakerId] ?? content.speakerId}</strong>}
            <span aria-live="polite">{content.text}</span>
            <i aria-hidden="true">⌄</i>
          </button>
        )}

        {content.kind === "choice" && (
          <div className="player-choice" role="group" aria-labelledby="player-choice-prompt">
            <p id="player-choice-prompt">{content.prompt}</p>
            {content.options.map((option, index) => (
              <button
                key={option.optionId}
                ref={(element) => { choiceButtons.current[index] = element; }}
                type="button"
                className={index === selectedChoiceIndex ? "is-selected" : undefined}
                data-player-selected={index === selectedChoiceIndex ? "true" : "false"}
                onFocus={() => setSelectedChoiceIndex(index)}
                onClick={() => applyIntent({ kind: "select-choice", optionId: option.optionId }, "pointer")}
              >
                <span aria-hidden="true">{index + 1}</span>{option.label}
              </button>
            ))}
          </div>
        )}

        {content.kind === "ending" && (
          <div className="player-ending" role="status">
            <span>ENDING</span>
            <h2>{content.name}</h2>
            <button className="player-secondary" type="button" onClick={() => applyIntent({ kind: "restart" }, "pointer")}>回到标题</button>
          </div>
        )}

        {content.kind === "error" && (
          <div className="player-error" role="alert">
            <span>无法安全启动</span>
            <h1>{snapshot.title}</h1>
            <p>{content.diagnostics[0]?.message ?? "未知 Player Core 错误"}</p>
            <code>{content.diagnostics[0]?.code ?? "PLAYER_UNKNOWN_ERROR"}</code>
            <button className="player-secondary" type="button" onClick={() => applyIntent({ kind: "restart" }, "pointer")}>重新载入工程</button>
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
                if (hostActivity === "active" && stage.missingAssetIds.length === 0 && mediaErrors.length === 0) applyIntent({ kind: "primary" }, "system");
              }}
            />
            <div className="player-boundary__actions">
              <button type="button" disabled={stage.missingAssetIds.length > 0 || mediaErrors.length > 0} onClick={() => applyIntent({ kind: "primary" }, "pointer")}>完成动效</button>
              {content.canCancel && <button type="button" onClick={() => applyIntent({ kind: "cancel" }, "pointer")}>跳过动效</button>}
            </div>
          </div>
        )}

        {content.kind === "barrier" && (
          <div className="player-boundary" role="alertdialog" aria-label={`确认不可逆步骤 ${content.descriptorId}`}>
            <span>不可逆边界</span><strong>{content.reason}</strong><code>{content.descriptorId}</code>
            <button type="button" onClick={() => applyIntent({ kind: "primary" }, "pointer")}>确认继续</button>
          </div>
        )}

        {content.kind === "wait" && <div className="player-boundary" role="status">等待 {content.durationMilliseconds}ms</div>}
      </section>
    </main>
  );
}
