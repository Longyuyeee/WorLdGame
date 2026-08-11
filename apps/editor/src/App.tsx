import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import { loadProject, saveProject, type ProjectFileStore } from "@world-studio/project-persistence";
import {
  deriveRouteGraph,
  findScene,
  findStatement,
  type Character,
  type StoryStatement
} from "@world-studio/story-core";
import {
  activeSourceDraft,
  activeSourceSession,
  createProjectSnapshot,
  createStudioSession,
  hasPendingDraft,
  reduceStudioSession,
  restoreStudioSession,
  type StudioAction,
  type StudioMode,
  type StudioSession
} from "./studio-session";
import { TransactionalTextarea } from "./transactional-textarea";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";

type PersistenceStatus = "loading" | "unavailable" | "unsaved" | "dirty" | "saving" | "saved" | "restored" | "error";

interface PersistenceViewState {
  readonly status: PersistenceStatus;
  readonly revision: number;
  readonly detail?: string;
}

const modeLabels: Record<StudioMode, string> = {
  writer: "Writer",
  script: "Script",
  flow: "Flow"
};

function statementLabel(statement: StoryStatement): string {
  switch (statement.kind) {
    case "dialogue":
      return statement.text;
    case "direction":
      return statement.summary;
    case "choice":
      return statement.prompt;
    case "end":
      return `结局 · ${statement.endingName}`;
  }
}

function statementKindLabel(statement: StoryStatement): string {
  switch (statement.kind) {
    case "dialogue":
      return "对白";
    case "direction":
      return "演出";
    case "choice":
      return "选择";
    case "end":
      return "结局";
  }
}

function findCharacter(
  characters: readonly Character[],
  characterId: string
): Character | undefined {
  return characters.find((character) => character.id === characterId);
}

interface CommonProps {
  readonly session: StudioSession;
  readonly dispatch: (action: StudioAction) => void;
}

interface WorkspaceHeaderProps extends CommonProps {
  readonly mode: StudioMode;
  readonly inputDirty: boolean;
  readonly onModeChange: (mode: StudioMode) => void;
  readonly persistence: PersistenceViewState;
  readonly onSave: () => void;
}

function WorkspaceHeader({
  mode,
  session,
  inputDirty,
  onModeChange,
  persistence,
  onSave,
  dispatch
}: WorkspaceHeaderProps) {
  const sourceSession = activeSourceSession(session);
  const pendingDraft = hasPendingDraft(session);
  return (
    <header className="workspace-header">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">W</span>
        <div>
          <p className="eyebrow">WorLd Studio · S0.9</p>
          <h1>{session.project.title}</h1>
        </div>
      </div>

      <nav className="mode-switcher" aria-label="编辑模式" role="tablist">
        {(Object.keys(modeLabels) as StudioMode[]).map((candidate) => (
          <button
            className={candidate === mode ? "mode-tab is-active" : "mode-tab"}
            key={candidate}
            onClick={() => onModeChange(candidate)}
            role="tab"
            aria-selected={candidate === mode}
          >
            <span className={`mode-dot mode-dot--${candidate}`} aria-hidden="true" />
            {modeLabels[candidate]}
          </button>
        ))}
      </nav>

      <div className="history-actions" aria-label="脚本历史">
        <button
          className="icon-button"
          aria-label="撤销"
          disabled={sourceSession.history.length === 0 || pendingDraft || inputDirty}
          onClick={() => dispatch({ type: "undo" })}
        >
          ↶
        </button>
        <button
          className="icon-button"
          aria-label="重做"
          disabled={sourceSession.future.length === 0 || pendingDraft || inputDirty}
          onClick={() => dispatch({ type: "redo" })}
        >
          ↷
        </button>
        <span className={pendingDraft ? "save-state is-draft" : inputDirty ? "save-state is-buffered" : "save-state"}>
          <span className="save-state__dot" aria-hidden="true" />
          {pendingDraft
            ? "错误草稿 · 未提交"
            : inputDirty
              ? "输入批次 · 未提交"
              : `本地事务 · r${sourceSession.revision}`}
        </span>
        <button
          className={`local-save-button local-save-button--${persistence.status}`}
          disabled={inputDirty || persistence.status === "loading" || persistence.status === "saving" || persistence.status === "unavailable"}
          onClick={onSave}
          title={persistence.detail ?? "保存项目快照到本机"}
        >
          {persistence.status === "loading" ? "正在恢复"
            : persistence.status === "unavailable" ? "存储不可用"
              : persistence.status === "saving" ? "保存中…"
                : persistence.status === "saved" ? `已保存 · s${persistence.revision}`
                  : persistence.status === "restored" ? `已恢复 · s${persistence.revision}`
                    : persistence.status === "error" ? "保存失败"
                      : "保存到本机"}
        </button>
      </div>
    </header>
  );
}

function SceneRail({ session, dispatch }: CommonProps) {
  return (
    <aside className="scene-rail" aria-label="场景列表">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">PROJECT</p>
          <h2>场景</h2>
        </div>
        <span className="count-badge">{session.project.scenes.length}</span>
      </div>
      <div className="scene-list">
        {session.project.scenes.map((scene, index) => (
          <button
            className={scene.id === session.activeSceneId ? "scene-item is-active" : "scene-item"}
            key={scene.id}
            onClick={() => dispatch({ type: "select-scene", sceneId: scene.id })}
          >
            <span className="scene-index">{String(index + 1).padStart(2, "0")}</span>
            <span>
              <strong>{scene.title}</strong>
              <small>{scene.statements.length} 个步骤</small>
            </span>
          </button>
        ))}
      </div>
      <div className="rail-status">
        <span className="status-orb" aria-hidden="true" />
        <span>
          <strong>Source of Truth</strong>
          <small>权威脚本 → 投影 → 三视图</small>
        </span>
      </div>
    </aside>
  );
}

interface WriterViewProps extends CommonProps {
  readonly createCommandId: () => string;
  readonly createEntityId: (prefix: "stmt" | "txt") => string;
  readonly onInputDirtyChange: (dirty: boolean) => void;
}

function WriterView({
  session,
  dispatch,
  createCommandId,
  createEntityId,
  onInputDirtyChange
}: WriterViewProps) {
  const scene = findScene(session.project, session.activeSceneId);
  const selected = findStatement(session.project, scene.id, session.selectedStatementId);
  const selectedIndex = scene.statements.findIndex((statement) => statement.id === selected.id);
  const previousAnchor =
    selectedIndex <= 1 ? scene.id : (scene.statements[selectedIndex - 2]?.id ?? scene.id);
  const nextStatement = scene.statements[selectedIndex + 1];
  const pendingDraft = hasPendingDraft(session);

  return (
    <section className="authoring-panel view-enter" aria-labelledby="writer-heading">
      <div className="panel-heading authoring-heading">
        <div>
          <p className="eyebrow">WRITER · STABLE-ID PATCH</p>
          <h2 id="writer-heading">{scene.title}</h2>
        </div>
        <span className="context-chip">权威脚本投影</span>
      </div>

      <div className="statement-toolbar" aria-label="对白结构工具">
        <button
          disabled={selected.kind !== "dialogue" || pendingDraft}
          onClick={() => {
            if (selected.kind !== "dialogue") return;
            dispatch({
              type: "insert-dialogue",
              commandId: createCommandId(),
              afterId: selected.id,
              statementId: createEntityId("stmt"),
              textId: createEntityId("txt"),
              speakerId: selected.speakerId,
              text: "新对白"
            });
          }}
        >
          ＋ 插入对白
        </button>
        <button
          aria-label="对白上移"
          disabled={selected.kind !== "dialogue" || selectedIndex === 0 || pendingDraft}
          onClick={() =>
            dispatch({
              type: "move-dialogue",
              commandId: createCommandId(),
              statementId: selected.id,
              afterId: previousAnchor
            })
          }
        >
          ↑
        </button>
        <button
          aria-label="对白下移"
          disabled={selected.kind !== "dialogue" || nextStatement === undefined || pendingDraft}
          onClick={() => {
            if (nextStatement === undefined) return;
            dispatch({
              type: "move-dialogue",
              commandId: createCommandId(),
              statementId: selected.id,
              afterId: nextStatement.id
            });
          }}
        >
          ↓
        </button>
        <button
          className="danger-button"
          disabled={selected.kind !== "dialogue" || pendingDraft}
          onClick={() =>
            dispatch({
              type: "delete-dialogue",
              commandId: createCommandId(),
              statementId: selected.id
            })
          }
        >
          删除
        </button>
      </div>

      <div className="statement-list" aria-label="剧情步骤">
        {scene.statements.map((statement, index) => (
          <button
            key={statement.id}
            className={
              statement.id === session.selectedStatementId
                ? `statement-card statement-card--${statement.kind} is-active`
                : `statement-card statement-card--${statement.kind}`
            }
            onClick={() => dispatch({ type: "select-statement", statementId: statement.id })}
            aria-label={`选择${statementKindLabel(statement)}：${statementLabel(statement)}`}
          >
            <span className="statement-order">{String(index + 1).padStart(2, "0")}</span>
            <span className="statement-kind">{statementKindLabel(statement)}</span>
            <span className="statement-copy">{statementLabel(statement)}</span>
          </button>
        ))}
      </div>

      <div className="inline-inspector">
        <div className="inspector-label-row">
          {selected.kind === "dialogue" ? (
            <label htmlFor="dialogue-editor">对白内容</label>
          ) : (
            <span className="inspector-title">当前步骤（只读）</span>
          )}
          <code>{selected.id}</code>
        </div>
        {selected.kind === "dialogue" ? (
          <TransactionalTextarea
            id="dialogue-editor"
            value={selected.text}
            rows={4}
            disabled={pendingDraft}
            onDirtyChange={onInputDirtyChange}
            onCommit={(text) =>
              dispatch({
                type: "patch-dialogue",
                commandId: createCommandId(),
                statementId: selected.id,
                text
              })
            }
          />
        ) : (
          <div className="readonly-step">{statementLabel(selected)}</div>
        )}
        <p className="field-help">
          Writer 不直接修改模型；每次编辑都通过稳定 ID Patch 写回权威脚本，再重新投影。
        </p>
      </div>
    </section>
  );
}

interface ScriptViewProps extends CommonProps {
  readonly createCommandId: () => string;
  readonly inputDirty: boolean;
  readonly onInputDirtyChange: (dirty: boolean) => void;
}

function ScriptView({
  session,
  dispatch,
  createCommandId,
  inputDirty,
  onInputDirtyChange
}: ScriptViewProps) {
  const sourceSession = activeSourceSession(session);
  const source = activeSourceDraft(session);
  const diagnostics = session.diagnostics[session.activeSceneId] ?? [];
  const pendingDraft = hasPendingDraft(session);
  return (
    <section className="script-panel view-enter" aria-labelledby="script-heading">
      <div className="panel-heading authoring-heading">
        <div>
          <p className="eyebrow">SCRIPT · CANONICAL SOURCE</p>
          <h2 id="script-heading">文本脚本</h2>
        </div>
        <span className={pendingDraft ? "context-chip context-chip--draft" : "context-chip"}>
          {pendingDraft
            ? "草稿隔离中"
            : inputDirty
              ? "输入批次未提交"
              : `已提交 · r${sourceSession.revision}`}
        </span>
      </div>

      <div className="script-toolbar">
        <span>WORLD SCRIPT · UTF-8 · Ctrl/Cmd+S 提交 · Esc 回退</span>
        <div>
          <button
            disabled={pendingDraft}
            onClick={() => dispatch({ type: "format-script", commandId: createCommandId() })}
          >
            格式化
          </button>
          <button
            className="danger-button"
            disabled={!pendingDraft}
            onClick={() => dispatch({ type: "discard-draft" })}
          >
            丢弃草稿
          </button>
        </div>
      </div>
      <TransactionalTextarea
        className="script-editor"
        aria-label="权威脚本编辑器"
        value={source}
        spellCheck={false}
        onDirtyChange={onInputDirtyChange}
        onEscapeWhenClean={pendingDraft ? () => dispatch({ type: "discard-draft" }) : undefined}
        onCommit={(nextSource) =>
          dispatch({
            type: "edit-script",
            commandId: createCommandId(),
            source: nextSource
          })
        }
      />

      <div className={diagnostics.length === 0 ? "diagnostics-console is-clear" : "diagnostics-console"}>
        <div className="diagnostics-heading">
          <strong>{diagnostics.length === 0 ? "0 个阻断问题" : `${diagnostics.length} 个诊断`}</strong>
          <span>{pendingDraft ? "PREVIEW LOCKED" : "PROJECTION READY"}</span>
        </div>
        {diagnostics.length === 0 ? (
          <p>语法、稳定 ID 与项目引用检查通过。</p>
        ) : (
          <ul>
            {diagnostics.map((item, index) => (
              <li key={`${item.code}:${item.line ?? 0}:${index}`}>
                <code>{item.code}</code>
                <span>{item.line === undefined ? "" : `L${item.line} · `}{item.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function FlowView({ session, dispatch }: CommonProps) {
  const graph = useMemo(() => deriveRouteGraph(session.project), [session.project]);
  return (
    <section className="flow-panel view-enter" aria-labelledby="flow-heading">
      <div className="panel-heading authoring-heading">
        <div>
          <p className="eyebrow">FLOW · DERIVED VIEW</p>
          <h2 id="flow-heading">自动路线图</h2>
        </div>
        <span className="context-chip context-chip--cyan">无语义副本</span>
      </div>
      <div className="flow-canvas">
        <div className="flow-grid" aria-label="路线节点">
          {graph.nodes.map((node, index) => (
            <button
              key={node.id}
              className={node.id === session.activeSceneId ? `route-node route-node--${node.kind} is-active` : `route-node route-node--${node.kind}`}
              style={{ "--node-order": index } as CSSProperties}
              onClick={() => dispatch({ type: "select-scene", sceneId: node.id })}
            >
              <span className="route-node__kind">
                {node.kind === "entry" ? "入口" : node.kind === "ending" ? "结局" : "场景"}
              </span>
              <strong>{node.title}</strong>
              <code>{node.id}</code>
            </button>
          ))}
        </div>
        <div className="edge-list" aria-label="路线连接">
          <p className="eyebrow">CONNECTIONS</p>
          {graph.edges.map((edge) => (
            <div className="edge-row" key={edge.id}>
              <span>{edge.sourceSceneId}</span><span className="edge-arrow">→</span>
              <strong>{edge.label}</strong><span className="edge-arrow">→</span>
              <span>{edge.targetSceneId}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface PreviewPanelProps extends CommonProps {
  readonly inputDirty: boolean;
}

function PreviewPanel({ session, dispatch, inputDirty }: PreviewPanelProps) {
  const scene = findScene(session.project, session.activeSceneId);
  const statement = scene.statements[session.previewIndex];
  if (statement === undefined) throw new Error(`Preview index is outside scene: ${session.previewIndex}`);
  const speaker = statement.kind === "dialogue"
    ? findCharacter(session.project.characters, statement.speakerId)
    : undefined;
  const sourceSession = activeSourceSession(session);
  const pendingDraft = hasPendingDraft(session);
  const showBufferedNotice = inputDirty && session.notice.tone !== "error";
  return (
    <aside className="preview-panel" aria-labelledby="preview-heading">
      <div className="panel-heading">
        <div><p className="eyebrow">LIVE PREVIEW</p><h2 id="preview-heading">即时预览</h2></div>
        <span className={pendingDraft ? "live-badge is-locked" : inputDirty ? "live-badge is-buffered" : "live-badge"}>
          {pendingDraft ? "LOCKED" : inputDirty ? "BUFFER" : "LIVE"}
        </span>
      </div>
      <div className="stage-preview">
        <div className="stage-chrome"><span>{scene.title}</span><span>16:9 · Balanced</span></div>
        <div className="stage-sky" aria-hidden="true">
          <span className="sun" /><span className="school-building" />
          <span className="character-silhouette character-silhouette--left" />
          <span className="character-silhouette character-silhouette--right" />
        </div>
        <div className="stage-content" key={statement.id} data-testid="preview-step">
          {statement.kind === "dialogue" && (
            <div className="dialogue-box">
              <span className="speaker-name" style={{ "--speaker-color": speaker?.color ?? "#8B7CFF" } as CSSProperties}>
                {speaker?.displayName ?? "未知角色"}
              </span>
              <p>{statement.text}</p>
            </div>
          )}
          {statement.kind === "direction" && <div className="stage-note"><span>演出指令</span><strong>{statement.summary}</strong></div>}
          {statement.kind === "choice" && (
            <div className="choice-preview"><strong>{statement.prompt}</strong>{statement.options.map((option) => <span key={option.id}>{option.label}</span>)}</div>
          )}
          {statement.kind === "end" && <div className="ending-preview"><span>ENDING</span><strong>{statement.endingName}</strong></div>}
        </div>
      </div>
      <div className="preview-transport">
        <button aria-label="上一步" onClick={() => dispatch({ type: "step-preview", direction: -1 })} disabled={session.previewIndex === 0}>←</button>
        <div><strong>{session.previewIndex + 1} / {scene.statements.length}</strong><small>{statementKindLabel(statement)} · {statement.id}</small></div>
        <button aria-label="下一步" onClick={() => dispatch({ type: "step-preview", direction: 1 })} disabled={session.previewIndex === scene.statements.length - 1}>→</button>
      </div>
      <div className={`diagnostic-card diagnostic-card--${showBufferedNotice ? "draft" : session.notice.tone}`} aria-live="polite">
        <span className="diagnostic-icon" aria-hidden="true">{showBufferedNotice ? "…" : session.notice.tone === "success" ? "✓" : session.notice.tone === "draft" ? "!" : "×"}</span>
        <div>
          <strong>{showBufferedNotice ? "输入批次尚未提交" : session.notice.title}</strong>
          <p>{showBufferedNotice ? "Preview 保持最后有效投影；停止输入、失焦或按 Ctrl/Cmd+S 后提交。" : session.notice.detail}</p>
        </div>
      </div>
      <div className="transaction-strip">
        <span>r{sourceSession.revision}</span><span>semantic {sourceSession.semanticRevision}</span><span>{sourceSession.tombstones.length} tombstone</span>
      </div>
      {sourceSession.tombstones.length > 0 && (
        <div className="tombstone-list" aria-label="已删除对白记录">
          <p className="eyebrow">TOMBSTONES</p>
          {sourceSession.tombstones.slice(-3).map((item) => <code key={item.statementId}>{item.statementId}</code>)}
        </div>
      )}
    </aside>
  );
}

export function App() {
  const [session, baseDispatch] = useReducer(reduceStudioSession, undefined, createStudioSession);
  const [mode, setMode] = useState<StudioMode>("writer");
  const [inputDirty, setInputDirty] = useState(false);
  const storageAvailable = typeof globalThis.indexedDB !== "undefined";
  const [persistence, setPersistence] = useState<PersistenceViewState>(() =>
    storageAvailable ? { status: "loading", revision: 0 } : { status: "unavailable", revision: 0 }
  );
  const storeRef = useRef<ProjectFileStore | null>(null);
  const storageRevision = useRef(0);
  const saveSerial = useRef(0);
  const commandSerial = useRef(0);
  const entitySerial = useRef(0);
  const dispatch = (action: StudioAction) => {
    baseDispatch(action);
    if ([
      "edit-script", "patch-dialogue", "insert-dialogue", "delete-dialogue",
      "move-dialogue", "format-script", "discard-draft", "undo", "redo"
    ].includes(action.type)) {
      setPersistence((current) => current.status === "unavailable"
        ? current
        : { status: "dirty", revision: current.revision });
    }
  };
  const createCommandId = () => `cmd_ui_${++commandSerial.current}`;
  const createEntityId = (prefix: "stmt" | "txt") => `${prefix}_ui_${++entitySerial.current}`;

  useEffect(() => {
    if (!storageAvailable) return;
    let cancelled = false;
    const store = new IndexedDbProjectFileStore(globalThis.indexedDB, "prj_twilight_broadcast");
    storeRef.current = store;
    void loadProject(store).then((snapshot) => {
      if (cancelled) return;
      if (snapshot === null) {
        setPersistence({ status: "unsaved", revision: 0 });
        return;
      }
      const restored = restoreStudioSession(snapshot);
      storageRevision.current = snapshot.storageRevision;
      baseDispatch({ type: "restore-session", session: restored });
      setPersistence({ status: "restored", revision: snapshot.storageRevision });
    }).catch((error: unknown) => {
      if (cancelled) return;
      setPersistence({
        status: "error",
        revision: storageRevision.current,
        detail: error instanceof Error ? error.message : "本地项目恢复失败"
      });
    });
    return () => { cancelled = true; };
  }, [storageAvailable]);

  const saveToLocal = () => {
    const store = storeRef.current;
    if (store === null || inputDirty || persistence.status === "saving") return;
    const nextRevision = storageRevision.current + 1;
    const snapshot = createProjectSnapshot(session, nextRevision);
    const transactionId = `save_${nextRevision}_${++saveSerial.current}`;
    setPersistence({ status: "saving", revision: storageRevision.current });
    void saveProject(store, snapshot, {
      transactionId,
      expectedStorageRevision: storageRevision.current
    }).then(() => {
      storageRevision.current = nextRevision;
      setPersistence({ status: "saved", revision: nextRevision });
    }).catch((error: unknown) => {
      setPersistence({
        status: "error",
        revision: storageRevision.current,
        detail: error instanceof Error ? error.message : "保存失败"
      });
    });
  };

  if (persistence.status === "loading") {
    return (
      <div className="startup-gate" role="status" aria-live="polite">
        <span className="startup-gate__orb" aria-hidden="true" />
        <p className="eyebrow">LOCAL-FIRST RECOVERY</p>
        <h1>正在校验本地项目…</h1>
        <p>检查 WAL 与 SHA-256 完整性后再开放编辑。</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <WorkspaceHeader mode={mode} session={session} inputDirty={inputDirty} onModeChange={setMode} persistence={persistence} onSave={saveToLocal} dispatch={dispatch} />
      <main className="workspace-grid">
        <SceneRail session={session} dispatch={dispatch} />
        {mode === "writer" ? (
          <WriterView session={session} dispatch={dispatch} createCommandId={createCommandId} createEntityId={createEntityId} onInputDirtyChange={setInputDirty} />
        ) : mode === "script" ? (
          <ScriptView session={session} dispatch={dispatch} createCommandId={createCommandId} inputDirty={inputDirty} onInputDirtyChange={setInputDirty} />
        ) : (
          <FlowView session={session} dispatch={dispatch} />
        )}
        <PreviewPanel session={session} dispatch={dispatch} inputDirty={inputDirty} />
      </main>
      <footer className="workspace-footer">
        <span>本地优先</span><span>无账户</span><span>WAL · SHA-256</span><span className="footer-accent">S0.9 LOCAL RECOVERY</span>
      </footer>
    </div>
  );
}
