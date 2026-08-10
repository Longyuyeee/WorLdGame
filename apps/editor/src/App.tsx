import { useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import {
  campusStoryProject,
  createWorkspaceSession,
  deriveRouteGraph,
  findScene,
  findStatement,
  reduceWorkspaceSession,
  type Character,
  type StoryStatement,
  type WorkspaceAction,
  type WorkspaceSession
} from "@world-studio/story-core";

type WorkspaceMode = "writer" | "flow";

const modeLabels: Record<WorkspaceMode, string> = {
  writer: "Writer",
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

interface WorkspaceHeaderProps {
  readonly mode: WorkspaceMode;
  readonly session: WorkspaceSession;
  readonly onModeChange: (mode: WorkspaceMode) => void;
  readonly dispatch: (action: WorkspaceAction) => void;
}

function WorkspaceHeader({
  mode,
  session,
  onModeChange,
  dispatch
}: WorkspaceHeaderProps) {
  return (
    <header className="workspace-header">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">
          W
        </span>
        <div>
          <p className="eyebrow">WorLd Studio · S0</p>
          <h1>{session.project.title}</h1>
        </div>
      </div>

      <nav className="mode-switcher" aria-label="编辑模式" role="tablist">
        {(Object.keys(modeLabels) as WorkspaceMode[]).map((candidate) => (
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

      <div className="history-actions" aria-label="编辑历史">
        <button
          className="icon-button"
          aria-label="撤销"
          disabled={session.history.length === 0}
          onClick={() => dispatch({ type: "undo" })}
        >
          ↶
        </button>
        <button
          className="icon-button"
          aria-label="重做"
          disabled={session.future.length === 0}
          onClick={() => dispatch({ type: "redo" })}
        >
          ↷
        </button>
        <span className="save-state">
          <span className="save-state__dot" aria-hidden="true" />
          本地草稿 · r{session.revision}
        </span>
      </div>
    </header>
  );
}

interface SceneRailProps {
  readonly session: WorkspaceSession;
  readonly dispatch: (action: WorkspaceAction) => void;
}

function SceneRail({ session, dispatch }: SceneRailProps) {
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
            className={
              scene.id === session.activeSceneId ? "scene-item is-active" : "scene-item"
            }
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
          <strong>Canonical Model</strong>
          <small>所有视图共享同一份数据</small>
        </span>
      </div>
    </aside>
  );
}

interface WriterViewProps {
  readonly session: WorkspaceSession;
  readonly dispatch: (action: WorkspaceAction) => void;
  readonly createCommandId: () => string;
}

function WriterView({ session, dispatch, createCommandId }: WriterViewProps) {
  const scene = findScene(session.project, session.activeSceneId);
  const selected = findStatement(
    session.project,
    session.activeSceneId,
    session.selectedStatementId
  );

  return (
    <section className="authoring-panel view-enter" aria-labelledby="writer-heading">
      <div className="panel-heading authoring-heading">
        <div>
          <p className="eyebrow">WRITER · {scene.id}</p>
          <h2 id="writer-heading">{scene.title}</h2>
        </div>
        <span className="context-chip">中文 · 主线</span>
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
            onClick={() =>
              dispatch({ type: "select-statement", statementId: statement.id })
            }
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
            <span className="inspector-title">当前步骤</span>
          )}
          <code>{selected.id}</code>
        </div>
        {selected.kind === "dialogue" ? (
          <textarea
            id="dialogue-editor"
            value={selected.text}
            rows={4}
            onChange={(event) =>
              dispatch({
                type: "execute",
                command: {
                  type: "edit-dialogue",
                  commandId: createCommandId(),
                  sceneId: scene.id,
                  statementId: selected.id,
                  text: event.target.value
                }
              })
            }
          />
        ) : (
          <div className="readonly-step">{statementLabel(selected)}</div>
        )}
        <p className="field-help">
          修改会立即写入共享模型；Flow、Preview 与历史记录读取同一个 revision。
        </p>
      </div>
    </section>
  );
}

interface FlowViewProps {
  readonly session: WorkspaceSession;
  readonly dispatch: (action: WorkspaceAction) => void;
}

function FlowView({ session, dispatch }: FlowViewProps) {
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
              className={
                node.id === session.activeSceneId
                  ? `route-node route-node--${node.kind} is-active`
                  : `route-node route-node--${node.kind}`
              }
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
              <span>{edge.sourceSceneId}</span>
              <span className="edge-arrow" aria-hidden="true">
                →
              </span>
              <strong>{edge.label}</strong>
              <span className="edge-arrow" aria-hidden="true">
                →
              </span>
              <span>{edge.targetSceneId}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface PreviewPanelProps {
  readonly session: WorkspaceSession;
  readonly dispatch: (action: WorkspaceAction) => void;
}

function PreviewPanel({ session, dispatch }: PreviewPanelProps) {
  const scene = findScene(session.project, session.activeSceneId);
  const statement = scene.statements[session.previewIndex];
  if (statement === undefined) {
    throw new Error(`Preview index is outside scene: ${session.previewIndex}`);
  }
  const speaker =
    statement.kind === "dialogue"
      ? findCharacter(session.project.characters, statement.speakerId)
      : undefined;

  return (
    <aside className="preview-panel" aria-labelledby="preview-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">LIVE PREVIEW</p>
          <h2 id="preview-heading">即时预览</h2>
        </div>
        <span className="live-badge">LIVE</span>
      </div>

      <div className="stage-preview">
        <div className="stage-chrome">
          <span>{scene.title}</span>
          <span>16:9 · Balanced</span>
        </div>
        <div className="stage-sky" aria-hidden="true">
          <span className="sun" />
          <span className="school-building" />
          <span className="character-silhouette character-silhouette--left" />
          <span className="character-silhouette character-silhouette--right" />
        </div>
        <div className="stage-content" key={statement.id} data-testid="preview-step">
          {statement.kind === "dialogue" && (
            <div className="dialogue-box">
              <span
                className="speaker-name"
                style={{ "--speaker-color": speaker?.color ?? "#8B7CFF" } as CSSProperties}
              >
                {speaker?.displayName ?? "未知角色"}
              </span>
              <p>{statement.text}</p>
            </div>
          )}
          {statement.kind === "direction" && (
            <div className="stage-note">
              <span>演出指令</span>
              <strong>{statement.summary}</strong>
            </div>
          )}
          {statement.kind === "choice" && (
            <div className="choice-preview">
              <strong>{statement.prompt}</strong>
              {statement.options.map((option) => (
                <span key={option.id}>{option.label}</span>
              ))}
            </div>
          )}
          {statement.kind === "end" && (
            <div className="ending-preview">
              <span>ENDING</span>
              <strong>{statement.endingName}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="preview-transport">
        <button
          aria-label="上一步"
          onClick={() => dispatch({ type: "step-preview", direction: -1 })}
          disabled={session.previewIndex === 0}
        >
          ←
        </button>
        <div>
          <strong>
            {session.previewIndex + 1} / {scene.statements.length}
          </strong>
          <small>
            {statementKindLabel(statement)} · {statement.id}
          </small>
        </div>
        <button
          aria-label="下一步"
          onClick={() => dispatch({ type: "step-preview", direction: 1 })}
          disabled={session.previewIndex === scene.statements.length - 1}
        >
          →
        </button>
      </div>

      <div className="diagnostic-card">
        <span className="diagnostic-icon" aria-hidden="true">
          ✓
        </span>
        <div>
          <strong>语义同步正常</strong>
          <p>Writer、Flow 与 Preview 正在读取 revision {session.revision}。</p>
        </div>
      </div>
    </aside>
  );
}

export function App() {
  const [session, dispatch] = useReducer(
    reduceWorkspaceSession,
    campusStoryProject,
    createWorkspaceSession
  );
  const [mode, setMode] = useState<WorkspaceMode>("writer");
  const commandSerial = useRef(0);
  const createCommandId = () => {
    commandSerial.current += 1;
    return `cmd_ui_${commandSerial.current}`;
  };

  return (
    <div className="app-shell">
      <WorkspaceHeader
        mode={mode}
        session={session}
        onModeChange={setMode}
        dispatch={dispatch}
      />
      <main className="workspace-grid">
        <SceneRail session={session} dispatch={dispatch} />
        {mode === "writer" ? (
          <WriterView
            session={session}
            dispatch={dispatch}
            createCommandId={createCommandId}
          />
        ) : (
          <FlowView session={session} dispatch={dispatch} />
        )}
        <PreviewPanel session={session} dispatch={dispatch} />
      </main>
      <footer className="workspace-footer">
        <span>本地优先</span>
        <span>无账户</span>
        <span>共享语义模型</span>
        <span className="footer-accent">S0 CODE PROTOTYPE</span>
      </footer>
    </div>
  );
}
