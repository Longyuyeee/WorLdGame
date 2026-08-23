import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ProjectLifecycleSession, RecentProject } from "@world-studio/project-domain";
import type { TrustedRouteOverview } from "./trusted-route-overview";
import { reduceLazySceneHistory, replaceLazySceneSource, type LazyScenePage } from "./lazy-scene-session";
import { TransactionalTextarea } from "./transactional-textarea";
import { LazySequenceEditor } from "./lazy-sequence-editor";

export interface ProjectArchiveDownload {
  readonly href: string;
  readonly filename: string;
  readonly byteLength: number;
  readonly dispose: () => void;
}
export interface ProjectHomeActions {
  readonly create: (title: string) => Promise<ProjectLifecycleSession>;
  readonly openDirectory: () => Promise<ProjectLifecycleSession>;
  readonly openRecent: (item: RecentProject) => Promise<ProjectLifecycleSession>;
  readonly openExample: () => Promise<ProjectLifecycleSession>;
  readonly openN23Benchmark: () => Promise<ProjectLifecycleSession>;
  readonly importArchive: (file: File) => Promise<ProjectLifecycleSession>;
  readonly exportArchive: (session: ProjectLifecycleSession) => Promise<ProjectArchiveDownload>;
  readonly openRouteOverview?: (item: RecentProject, offset?: number) => Promise<TrustedRouteOverview>;
  readonly openLazyScene?: (item: RecentProject, overview: TrustedRouteOverview, sceneId: string) => Promise<LazyScenePage>;
  readonly saveLazyScene?: (item: RecentProject, page: LazyScenePage) => Promise<LazyScenePage>;
}

export function ProjectHome({ recent, actions, onEnter }: {
  readonly recent: readonly RecentProject[];
  readonly actions: ProjectHomeActions;
  readonly onEnter: (session: ProjectLifecycleSession) => void;
}) {
  const [title, setTitle] = useState("未命名故事");
  const [selected, setSelected] = useState<ProjectLifecycleSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [download, setDownload] = useState<ProjectArchiveDownload | null>(null);
  const [routeOverview, setRouteOverview] = useState<{ readonly item: RecentProject; readonly overview: TrustedRouteOverview } | null>(null);
  const [lazyScene, setLazyScene] = useState<LazyScenePage | null>(null);
  const [routeStale, setRouteStale] = useState(false);
  const [lazySceneView, setLazySceneView] = useState<"script" | "sequence">("script");
  const commandSerial = useRef(0);
  useEffect(() => () => download?.dispose(), [download]);
  const run = async (action: () => Promise<ProjectLifecycleSession>) => {
    setBusy(true);
    setError(null);
    setDownload(null);
    try { setSelected(await action()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const prepareExport = async (action: () => Promise<ProjectArchiveDownload>) => {
    setBusy(true);
    setError(null);
    try { setDownload(await action()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const openRouteOverview = async (item: RecentProject, offset?: number) => {
    if (actions.openRouteOverview === undefined) return;
    setBusy(true);
    setError(null);
    setDownload(null);
    try { setRouteOverview({ item, overview: await actions.openRouteOverview(item, offset) }); setLazyScene(null); setLazySceneView("script"); setRouteStale(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const openLazyScene = async (sceneId: string) => {
    if (routeOverview === null || actions.openLazyScene === undefined) return;
    setBusy(true); setError(null); setLazyScene(null); setLazySceneView("script");
    try { setLazyScene(await actions.openLazyScene(routeOverview.item, routeOverview.overview, sceneId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const saveLazyScene = async () => {
    if (routeOverview === null || lazyScene === null || actions.saveLazyScene === undefined) return;
    setBusy(true); setError(null);
    try {
      const saved = await actions.saveLazyScene(routeOverview.item, lazyScene);
      setLazyScene(saved);
      if (saved.status === "ready" && saved.sourceVersion !== routeOverview.overview.sourceVersion) setRouteStale(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(() => actions.create(title));
  };

  return <main className="project-home" aria-label="项目首页">
    <header className="project-home__hero">
      <p className="eyebrow">WORLD STUDIO</p>
      <h1>选择一个真实工程</h1>
      <p>工程保存在你选择的目录或浏览器私有工作区；无需账户，导出后可离线重开。</p>
    </header>
    <section className="project-home__card" aria-labelledby="project-create-title">
      <h2 id="project-create-title">开始创作</h2>
      <form className="project-home__create" onSubmit={submit}>
        <label>项目名称<input aria-label="项目名称" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <button disabled={busy || title.trim() === ""}>新建工程</button>
      </form>
      <div className="project-home__actions">
        <button disabled={busy} onClick={() => void run(actions.openDirectory)}>打开工程目录</button>
        <button disabled={busy} onClick={() => void run(actions.openExample)}>打开示例工程</button>
        <button disabled={busy} onClick={() => void run(actions.openN23Benchmark)}>打开五分钟验收工程</button>
        <label className="button-like">导入工程 ZIP<input aria-label="导入工程 ZIP" type="file" accept=".zip,application/zip" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(() => actions.importArchive(file)); }} /></label>
      </div>
    </section>
    <section className="project-home__card" aria-labelledby="recent-title">
      <h2 id="recent-title">最近工程</h2>
      {recent.length === 0
        ? <p>还没有最近工程。这里仅保存位置引用和权限键，不复制工程内容。</p>
        : <ul className="project-home__recent">{recent.map((item) => <li key={item.reference.referenceId}><button disabled={busy} onClick={() => void run(() => actions.openRecent(item))}><strong>{item.title}</strong><span>{item.reference.displayLocation}</span></button>{actions.openRouteOverview !== undefined && item.reference.hostKind === "web-indexeddb" ? <button disabled={busy} aria-label={`快速查看 ${item.title} Route`} onClick={() => void openRouteOverview(item)}>Route 首屏</button> : null}</li>)}</ul>}
    </section>
    {routeOverview ? <section className="project-home__card project-home__route-overview" aria-label="Route 快速概览">
      <p className="eyebrow">TRUSTED ROUTE-FIRST</p>
      <h2>{routeOverview.overview.title} · Route</h2>
      <p>仅载入工程结构和当前布局窗口；{routeOverview.overview.window.start + 1}–{routeOverview.overview.window.end} / {routeOverview.overview.totalScenes} 个场景。</p>
      <p role="status">源读取 {routeOverview.overview.sourceRead.fileCount} 文件 / {routeOverview.overview.sourceRead.utf8Bytes} bytes，其中 layout {routeOverview.overview.sourceRead.layoutFileCount}；未执行 full read。</p>
      {routeStale ? <p role="status">单场景已原子保存；Route 派生视图已失效，请加载完整工程重建。</p> : null}
      <ul>{routeOverview.overview.window.nodes.map((node) => <li key={node.id}><strong>{node.title}</strong><span>{node.kind} · {node.facts.length} facts · ({node.layout.x}, {node.layout.y})</span>{actions.openLazyScene !== undefined ? <button disabled={busy || routeStale} aria-label={`编辑场景 ${node.title}`} onClick={() => void openLazyScene(node.id)}>编辑场景</button> : null}</li>)}</ul>
      {lazyScene?.sourceSession ? <section aria-label="单场景 Script/Sequence 编辑器">
        <h3>{lazyScene.scene.title} · {lazySceneView === "script" ? "Script" : "Sequence"}</h3>
        <p>状态：{lazyScene.status} · 仅加载当前场景 script + layout；Sequence 可执行单次新增旁白事务，其他结构、ID 与跨实体引用仍需进入完整工程。</p>
        {lazyScene.editIndex ? <p>全局编辑索引：{lazyScene.editIndex.entities.length} IDs / {lazyScene.editIndex.references.length} refs · revision 已对齐</p> : null}
        <div className="project-home__actions" role="group" aria-label="局部场景视图">
          <button aria-pressed={lazySceneView === "script"} onClick={() => setLazySceneView("script")}>Script 视图</button>
          <button aria-pressed={lazySceneView === "sequence"} onClick={() => setLazySceneView("sequence")}>Sequence 视图</button>
        </div>
        {lazySceneView === "script" ? <TransactionalTextarea
          aria-label="单场景权威脚本编辑器"
          rows={12}
          value={lazyScene.sourceSession.draftSource}
          onCommit={(source) => setLazyScene((current) => current === null ? current : replaceLazySceneSource(current, source, `lazy-scene-${++commandSerial.current}`))}
        /> : <LazySequenceEditor page={lazyScene} busy={busy || lazyScene.sourceSession.draftSource !== lazyScene.sourceSession.committedSource} createCommandId={() => `lazy-sequence-${++commandSerial.current}`} onPage={setLazyScene} />}
        {lazyScene.error ? <p role="alert">{lazyScene.error}</p> : null}
        <div className="project-home__actions">
          <button disabled={busy || lazyScene.sourceSession.history.length === 0 || lazyScene.sourceSession.draftSource !== lazyScene.sourceSession.committedSource} onClick={() => setLazyScene((current) => current === null ? current : reduceLazySceneHistory(current, "undo"))}>撤销</button>
          <button disabled={busy || lazyScene.sourceSession.future.length === 0 || lazyScene.sourceSession.draftSource !== lazyScene.sourceSession.committedSource} onClick={() => setLazyScene((current) => current === null ? current : reduceLazySceneHistory(current, "redo"))}>重做</button>
          <button disabled={busy || lazyScene.status !== "dirty"} onClick={() => void saveLazyScene()}>保存当前场景</button>
        </div>
      </section> : lazyScene ? <p role={lazyScene.status === "error" || lazyScene.status === "stale" ? "alert" : "status"}>{lazyScene.error ?? `场景状态：${lazyScene.status}`}</p> : null}
      <div className="project-home__actions">
        <button disabled={busy || routeStale || !routeOverview.overview.window.hasPrevious} onClick={() => void openRouteOverview(routeOverview.item, Math.max(0, routeOverview.overview.window.start - 64))}>上一窗口</button>
        <button disabled={busy || routeStale || !routeOverview.overview.window.hasNext} onClick={() => void openRouteOverview(routeOverview.item, routeOverview.overview.window.end)}>下一窗口</button>
        <button disabled={busy} onClick={() => void run(() => actions.openRecent(routeOverview.item))}>加载完整工程</button>
      </div>
    </section> : null}
    {selected ? <section className="project-home__card project-home__status" aria-label="工程状态">
      <h2>{selected.title}</h2>
      <dl>
        <div><dt>位置</dt><dd>{selected.reference.displayLocation}</dd></div>
        <div><dt>Schema</dt><dd>{selected.schemaVersion}</dd></div>
        <div><dt>状态</dt><dd>{selected.dirty ? "有未保存修改" : "已同步"}</dd></div>
        <div><dt>恢复</dt><dd>{selected.recovery === "clean" ? "无需恢复" : "已恢复"}</dd></div>
        <div><dt>访问</dt><dd>{selected.access === "editable" ? "可编辑" : `只读：${selected.readOnlyReason}`}</dd></div>
      </dl>
      <div className="project-home__actions">
        <button disabled={selected.access !== "editable" || selected.project === null} onClick={() => onEnter(selected)}>进入编辑器</button>
        <button disabled={busy || selected.project === null} onClick={() => void prepareExport(() => actions.exportArchive(selected))}>准备导出 ZIP</button>
        {download ? <a className="button-like" href={download.href} download={download.filename}>下载工程 ZIP · {(download.byteLength / 1024).toFixed(1)} KiB</a> : null}
      </div>
    </section> : null}
    {busy ? <p role="status">正在验证工程…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </main>;
}
