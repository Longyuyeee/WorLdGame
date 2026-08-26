import { useEffect, useMemo, useState } from "react";
import type { CanonicalProject } from "@world-studio/project-domain";
import {
  advancePlayerCore,
  createPlayerCore,
  createPlayerCoreSnapshotV1,
  selectPlayerCoreChoice,
  startPlayerCore,
  type PlayerCoreState
} from "@world-studio/player-core";
import "./player-shell.css";

export interface PlayerShellProps {
  readonly project: CanonicalProject;
}

function nextState(state: PlayerCoreState, project: CanonicalProject): PlayerCoreState {
  if (state.status === "title") return startPlayerCore(state, project);
  if (state.status === "presenting") return advancePlayerCore(state);
  return state;
}

export function PlayerShell({ project }: PlayerShellProps) {
  const [state, setState] = useState(() => createPlayerCore(project));
  const snapshot = useMemo(() => createPlayerCoreSnapshotV1(state), [state]);
  const content = snapshot.presentation;
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
    >
      <div className="player-glow player-glow--violet" />
      <div className="player-glow player-glow--cyan" />
      <section className="player-stage" aria-label={`${snapshot.title} 游戏画面`}>
        <header className="player-brand" aria-label="播放器状态">
          <span className="player-brand__mark" aria-hidden="true">W</span>
          <span>WorLd Player</span>
          <span className="player-brand__status">{snapshot.status}</span>
        </header>

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
          <button className="player-dialogue" type="button" onClick={() => setState((current) => nextState(current, project))} aria-label="继续下一句">
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

        {(content.kind === "wait" || content.kind === "effect" || content.kind === "barrier") && (
          <div className="player-boundary" role="status">正在等待正式 Runtime Host…</div>
        )}
      </section>
    </main>
  );
}
