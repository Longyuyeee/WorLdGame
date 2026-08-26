import { useEffect, useMemo, useState, type CompositionEvent, type CSSProperties, type KeyboardEvent } from "react";
import type { StudioAction, StudioSession } from "./studio-session";
import { createMobileFocusWorkspaceModel, type MobileFocusLine } from "./mobile-focus-workspace";

interface MobileFocusWorkspaceProps {
  readonly session: StudioSession;
  readonly dispatch: (action: StudioAction) => void;
  readonly createCommandId: () => string;
  readonly onInputDirtyChange: (dirty: boolean) => void;
}

export function MobileFocusWorkspace({
  session,
  dispatch,
  createCommandId,
  onInputDirtyChange
}: MobileFocusWorkspaceProps) {
  const model = useMemo(
    () => createMobileFocusWorkspaceModel(session.project, session.activeSceneId, session.selectedStatementId),
    [session.project, session.activeSceneId, session.selectedStatementId]
  );
  const [draft, setDraft] = useState(model.current?.text ?? "");
  const [composing, setComposing] = useState(false);
  const [status, setStatus] = useState("Canonical 工程已连接");
  const dirty = model.current !== null && draft !== model.current.text;

  useEffect(() => {
    setDraft(model.current?.text ?? "");
    setComposing(false);
    setStatus(model.current === null ? "请选择一条对白开始专注编辑" : "Canonical 工程已连接");
  }, [model.current?.statementId, model.current?.text]);

  useEffect(() => {
    onInputDirtyChange(dirty);
  }, [dirty, onInputDirtyChange]);

  useEffect(() => () => onInputDirtyChange(false), [onInputDirtyChange]);

  const navigate = (line: MobileFocusLine | null) => {
    if (line === null || dirty || composing) return;
    dispatch({ type: "select-project-result", sceneId: line.sceneId, statementId: line.statementId });
  };

  const commit = () => {
    if (model.current === null || !dirty || composing || draft.trim().length === 0) return;
    dispatch({
      type: "patch-dialogue",
      commandId: createCommandId(),
      statementId: model.current.statementId,
      text: draft
    });
    setStatus(`已提交 ${model.current.statementId}`);
  };

  const discard = () => {
    if (model.current === null) return;
    setDraft(model.current.text);
    setStatus("已放弃未提交输入");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape" && !composing) {
      event.preventDefault();
      discard();
    }
  };

  if (model.current === null) {
    return (
      <section className="mobile-focus-workspace" aria-labelledby="mobile-focus-title">
        <header className="mobile-focus-workspace__hero">
          <p className="eyebrow">MOBILE FOCUS · CANONICAL</p>
          <h2 id="mobile-focus-title">移动专注编辑</h2>
          <p>这是同一 Web 编辑器的窄屏创作任务，不代表 Android 应用或 APK 交付。</p>
        </header>
        <div className="mobile-focus-empty">
          <span aria-hidden="true">✦</span>
          <h3>当前步骤不是对白</h3>
          <p>工程中共有 {model.dialogueCount} 条对白。进入对白后可逐句前进、后退和提交。</p>
          <button type="button" disabled={model.entry === null} onClick={() => navigate(model.entry)}>
            开始第一条对白
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mobile-focus-workspace" aria-labelledby="mobile-focus-title">
      <header className="mobile-focus-workspace__hero">
        <div>
          <p className="eyebrow">MOBILE FOCUS · CANONICAL</p>
          <h2 id="mobile-focus-title">移动专注编辑</h2>
        </div>
        <span className="mobile-focus-workspace__sync">● {status}</span>
      </header>

      <div className="mobile-focus-progress" aria-label={`对白进度 ${model.current.position} / ${model.current.total}`}>
        <span style={{ width: `${(model.current.position / model.current.total) * 100}%` }} />
      </div>

      <article className="mobile-focus-editor" data-input-state={composing ? "composing" : dirty ? "buffered" : "committed"}>
        <div className="mobile-focus-editor__context">
          <span>{model.current.sceneTitle}</span>
          <code>{model.current.statementId}</code>
          <strong>{model.current.position} / {model.current.total}</strong>
        </div>
        <label className="mobile-focus-speaker" style={{ "--speaker-color": model.current.speakerColor } as CSSProperties}>
          <span aria-hidden="true" />
          说话者
          <strong>{model.current.speakerName}</strong>
        </label>
        <textarea
          aria-label="移动专注对白"
          value={draft}
          rows={7}
          onChange={(event) => setDraft(event.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={(event: CompositionEvent<HTMLTextAreaElement>) => {
            setDraft(event.currentTarget.value);
            setComposing(false);
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="mobile-focus-editor__state" aria-live="polite">
          <span>{composing ? "中文输入组合中" : dirty ? "输入已缓冲，尚未提交" : "内容已提交"}</span>
          <small>Ctrl/⌘ + S 提交 · Esc 放弃</small>
        </div>
        <div className="mobile-focus-editor__actions">
          <button type="button" className="mobile-focus-secondary" disabled={!dirty || composing} onClick={discard}>放弃修改</button>
          <button type="button" className="mobile-focus-primary" disabled={!dirty || composing || draft.trim().length === 0} onClick={commit}>提交到工程</button>
        </div>
      </article>

      <nav className="mobile-focus-navigation" aria-label="对白导航">
        <button type="button" disabled={model.previous === null || dirty || composing} onClick={() => navigate(model.previous)}>
          <span aria-hidden="true">←</span><small>上一句</small>
        </button>
        <button type="button" disabled={model.next === null || dirty || composing} onClick={() => navigate(model.next)}>
          <small>下一句</small><span aria-hidden="true">→</span>
        </button>
      </nav>
    </section>
  );
}
