import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ProjectLifecycleSession, RecentProject } from "@world-studio/project-domain";
import type { TrustedRouteOverview } from "./trusted-route-overview";
import { reduceLazySceneHistory, replaceLazySceneSource, type LazyScenePage } from "./lazy-scene-session";
import { TransactionalTextarea } from "./transactional-textarea";
import { LazySequenceEditor } from "./lazy-sequence-editor";
import { EditorThemeControl } from "./editor-theme";
import { StudioIcon } from "./studio-icon";

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
  readonly openN42MediaStage: () => Promise<ProjectLifecycleSession>;
  readonly importArchive: (file: File) => Promise<ProjectLifecycleSession>;
  readonly exportArchive: (session: ProjectLifecycleSession) => Promise<ProjectArchiveDownload>;
  readonly openRouteOverview?: (item: RecentProject, offset?: number) => Promise<TrustedRouteOverview>;
  readonly openLazyScene?: (item: RecentProject, overview: TrustedRouteOverview, sceneId: string) => Promise<LazyScenePage>;
  readonly saveLazyScene?: (item: RecentProject, page: LazyScenePage) => Promise<LazyScenePage>;
}

function projectColor(title: string) {
  let hash = 2166136261;
  for (const character of title) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ["violet", "teal", "coral", "blue"][(hash >>> 16) % 4];
}

export function ProjectHome({ recent, actions, onEnter }: {
  readonly recent: readonly RecentProject[];
  readonly actions: ProjectHomeActions;
  readonly onEnter: (session: ProjectLifecycleSession) => void;
}) {
  const [title, setTitle] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const createDialog = useRef<HTMLDialogElement>(null);
  const routeDialog = useRef<HTMLDialogElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<ProjectLifecycleSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [download, setDownload] = useState<ProjectArchiveDownload | null>(null);
  const [routeOverview, setRouteOverview] = useState<{ readonly item: RecentProject; readonly overview: TrustedRouteOverview } | null>(null);
  const [lazyScene, setLazyScene] = useState<LazyScenePage | null>(null);
  const [routeStale, setRouteStale] = useState(false);
  const [lazySceneView, setLazySceneView] = useState<"script" | "sequence">("script");
  const [lazyInputDirty, setLazyInputDirty] = useState(false);
  const lazyPending = lazyInputDirty || lazyScene?.status === "dirty" || (lazyScene?.sourceSession !== undefined && lazyScene?.sourceSession !== null && lazyScene.sourceSession.draftSource !== lazyScene.sourceSession.committedSource);
  const commandSerial = useRef(0);
  useEffect(() => () => download?.dispose(), [download]);
  useEffect(() => {
    const closeMenus = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      for (const menu of document.querySelectorAll<HTMLDetailsElement>(".home-theme, .home-project-more, .home-footer .project-home__validation-tools")) {
        if (event instanceof KeyboardEvent || !menu.contains(event.target as Node)) menu.open = false;
      }
    };
    document.addEventListener("pointerdown", closeMenus); document.addEventListener("keydown", closeMenus);
    return () => { document.removeEventListener("pointerdown", closeMenus); document.removeEventListener("keydown", closeMenus); };
  }, []);
  useEffect(() => {
    const dialog = createDialog.current;
    if (createOpen && !dialog?.open) dialog?.showModal();
    else if (!createOpen && dialog?.open) dialog.close();
  }, [createOpen]);
  useEffect(() => {
    const dialog = routeDialog.current;
    if (routeOverview && !dialog?.open) dialog?.showModal();
  }, [routeOverview]);
  const run = async (action: () => Promise<ProjectLifecycleSession>) => {
    setBusy(true);
    setError(null);
    setDownload(null);
    try {
      const opened = await action();
      if (opened.access === "editable" && opened.project !== null) onEnter(opened);
      else { setSelected(opened); setCreateOpen(false); }
    }
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
    if (busy || lazyPending || actions.openRouteOverview === undefined) return;
    setBusy(true);
    setError(null);
    setDownload(null);
    try { setRouteOverview({ item, overview: await actions.openRouteOverview(item, offset) }); setLazyScene(null); setLazySceneView("script"); setRouteStale(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const openLazyScene = async (sceneId: string) => {
    if (busy || lazyPending || routeOverview === null || actions.openLazyScene === undefined) return;
    setBusy(true); setError(null); setLazyScene(null); setLazySceneView("script");
    try { setLazyScene(await actions.openLazyScene(routeOverview.item, routeOverview.overview, sceneId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const saveLazyScene = async () => {
    if (busy || lazyInputDirty || routeOverview === null || lazyScene === null || actions.saveLazyScene === undefined) return;
    setBusy(true); setError(null);
    try {
      const saved = await actions.saveLazyScene(routeOverview.item, lazyScene);
      setLazyScene(saved);
      if (saved.status === "ready" && saved.sourceVersion !== routeOverview.overview.sourceVersion) setRouteStale(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const closeRouteOverview = () => {
    setRouteOverview(null); setLazyScene(null); setLazyInputDirty(false); setError(null);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(() => actions.create(title.trim()));
  };

  return <main className="project-home" aria-label="项目首页">
    <div className="project-home__topbar">
      <div className="home-brand"><span className="studio-logo" aria-hidden="true">W</span>WorLd <span>Studio</span></div>
      <details className="home-theme"><summary><StudioIcon name="appearance" />主题</summary><div className="home-theme__panel"><EditorThemeControl /></div></details>
    </div>
    <header className="project-home__hero">
      <div><p className="eyebrow"><span />你的故事工作室</p><h1>{recent.length ? "继续，把故事写下去。" : "每个世界，都始于一个故事。"}</h1><p>选择项目即可开始写作。你的作品保存在本机。</p></div>
      <button className="project-home__primary home-create-button" disabled={busy} onClick={() => { setTitle(""); setCreateOpen(true); }}><StudioIcon name="plus" />新建项目</button>
    </header>
    <section className="home-quick-start" aria-label="开始创作">
      <button className="home-start-card" data-color="violet" aria-label="打开工程目录" disabled={busy} onClick={() => void run(actions.openDirectory)}><span className="home-start-icon"><StudioIcon name="folder" /></span><span><strong>本地目录</strong><small>打开文件夹里的故事项目</small></span><StudioIcon name="arrow" /></button>
      <button className="home-start-card" data-color="blue" disabled={busy} onClick={() => importInput.current?.click()}><span className="home-start-icon"><StudioIcon name="import" /></span><span><strong>导入项目</strong><small>打开工程 ZIP 或制作交付包继续编辑</small></span><StudioIcon name="arrow" /></button>
      <button className="home-start-card" data-color="coral" aria-label="打开示例工程" disabled={busy} onClick={() => void run(actions.openExample)}><span className="home-start-icon"><StudioIcon name="sparkles" /></span><span><strong>探索示例</strong><small>打开一个故事，边看边学</small></span><StudioIcon name="arrow" /></button>
      <input className="home-file-input" ref={importInput} aria-label="导入工程 ZIP" type="file" accept=".zip,application/zip" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void run(() => actions.importArchive(file)); }} />
    </section>
    <section className="home-projects" aria-labelledby="recent-title">
      <div className="home-section-heading"><div><h2 id="recent-title">我的项目 <span>{recent.length}</span></h2><p>点击卡片，直接进入创作。</p></div><label className="home-project-search"><StudioIcon name="search" /><input aria-label="搜索项目" placeholder="搜索项目…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
      {recent.length === 0 ? <div className="home-empty"><span className="home-empty-icon"><StudioIcon name="story" /></span><h3>下一段故事，等你开启</h3><p>新建一个项目，或者打开示例寻找灵感。</p></div>
        : <ul className="project-home__recent home-project-grid">{recent.filter(item => item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item => <li key={item.reference.referenceId} data-color={projectColor(item.title)}>
          <button className="home-project-card" aria-label={`打开项目：${item.title}`} disabled={busy} onClick={() => void run(() => actions.openRecent(item))}>
            <span className="home-project-cover" aria-hidden="true"><span className="home-cover-orbit" /><span className="home-cover-letter">{item.title.slice(0, 1)}</span><StudioIcon name="story" /><span className="home-cover-caption">STORY PROJECT</span></span>
            <span className="home-project-caption"><strong>{item.title}</strong><span><span className="home-storage-dot" />{item.reference.hostKind === "web-file-system" ? "本地目录" : "本机项目"}<span className="home-project-time">{new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(item.lastOpenedAtMs)} 打开</span></span></span>
            <span className="home-project-open"><StudioIcon name="arrow" /></span>
          </button>
          {actions.openRouteOverview !== undefined && item.reference.hostKind === "web-indexeddb" ? <details className="home-project-more"><summary aria-label={`${item.title}的更多选项`}>•••</summary><div><button disabled={busy} aria-label={`快速查看 ${item.title} Route`} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); void openRouteOverview(item); }}><StudioIcon name="route" />大项目分场景编辑</button></div></details> : null}
        </li>)}</ul>}
      {recent.length > 0 && !recent.some(item => item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ? <p className="home-no-results">没有找到“{query}”，试试其他名称。</p> : null}
    </section>
    <footer className="home-footer"><span className="home-local-note"><StudioIcon name="checks" />本地创作 · 随时导出 · 无需账户</span><details className="project-home__validation-tools"><summary>开发与验收工程</summary><div className="project-home__actions"><button disabled={busy} onClick={() => void run(actions.openN23Benchmark)}>打开五分钟验收工程</button><button disabled={busy} onClick={() => void run(actions.openN42MediaStage)}>打开 Stage 媒体验收工程</button></div></details></footer>
    <dialog ref={createDialog} className="home-create-dialog" aria-labelledby="project-create-title" onCancel={event => { if (busy) event.preventDefault(); else setCreateOpen(false); }}>
      <form className="project-home__create" onSubmit={submit}><span className="home-start-icon" data-color="violet"><StudioIcon name="write" /></span><h2 id="project-create-title">开启一个新故事</h2><p>先取个名字，其他都可以边写边完善。</p><label>项目名称<input autoFocus aria-label="项目名称" placeholder="例如：雨后的约定" maxLength={100} value={title} onChange={event => setTitle(event.target.value)} /></label><div className="home-dialog-actions"><button type="button" disabled={busy} onClick={() => setCreateOpen(false)}>取消</button><button className="project-home__primary" disabled={busy || title.trim() === ""}>{busy ? "正在创建…" : "创建并开始写作"}<StudioIcon name="arrow" /></button></div>{error ? <p role="alert">{error}</p> : null}</form>
    </dialog>
    {routeOverview ? <dialog ref={routeDialog} className="home-route-dialog" aria-label="大项目分场景编辑" onCancel={event => { if (busy || lazyPending) event.preventDefault(); else closeRouteOverview(); }}><button className="home-route-close" disabled={busy || lazyPending} onClick={closeRouteOverview}>关闭</button>{lazyPending ? <p>当前场景有未保存修改，请先保存。<button disabled={busy} onClick={closeRouteOverview}>放弃修改并关闭</button></p> : null}{error ? <p role="alert">{error}</p> : null}<section className="project-home__card project-home__route-overview" aria-label="Route 快速概览">
      <p className="eyebrow">TRUSTED ROUTE-FIRST</p>
      <h2>{routeOverview.overview.title} · Route</h2>
      <p>仅载入工程结构和当前布局窗口；{routeOverview.overview.window.start + 1}–{routeOverview.overview.window.end} / {routeOverview.overview.totalScenes} 个场景。</p>
      <p role="status">源读取 {routeOverview.overview.sourceRead.fileCount} 文件 / {routeOverview.overview.sourceRead.utf8Bytes} bytes，其中 layout {routeOverview.overview.sourceRead.layoutFileCount}；未执行 full read。</p>
      {routeStale ? <p role="status">单场景已原子保存；Route 派生视图已失效，请加载完整工程重建。</p> : null}
      <ul>{routeOverview.overview.window.nodes.map((node) => <li key={node.id}><strong>{node.title}</strong><span>{node.kind} · {node.facts.length} facts · ({node.layout.x}, {node.layout.y})</span>{actions.openLazyScene !== undefined ? <button disabled={busy || lazyPending || routeStale} aria-label={`编辑场景 ${node.title}`} onClick={() => void openLazyScene(node.id)}>编辑场景</button> : null}</li>)}</ul>
      {lazyScene?.sourceSession ? <section aria-label="单场景 Script/Sequence 编辑器">
        <h3>{lazyScene.scene.title} · {lazySceneView === "script" ? "Script" : "Sequence"}</h3>
        <p>状态：{lazyScene.status} · 仅加载当前场景 script + layout；Sequence 可执行一次已审计的旁白或对白结构事务，控制流结构仍需进入完整工程。</p>
        {lazyScene.editIndex ? <p>全局编辑索引：{lazyScene.editIndex.entities.length} IDs / {lazyScene.editIndex.references.length} refs · revision 已对齐</p> : null}
        <div className="project-home__actions" role="group" aria-label="局部场景视图">
          <button disabled={lazyInputDirty} aria-pressed={lazySceneView === "script"} onClick={() => setLazySceneView("script")}>Script 视图</button>
          <button disabled={lazyInputDirty} aria-pressed={lazySceneView === "sequence"} onClick={() => setLazySceneView("sequence")}>Sequence 视图</button>
        </div>
        {lazySceneView === "script" ? <TransactionalTextarea
          aria-label="单场景权威脚本编辑器"
          rows={12}
          value={lazyScene.sourceSession.draftSource}
          onDirtyChange={setLazyInputDirty}
          onCommit={(source) => setLazyScene((current) => current === null ? current : replaceLazySceneSource(current, source, `lazy-scene-${++commandSerial.current}`))}
        /> : <LazySequenceEditor page={lazyScene} busy={busy || lazyScene.sourceSession.draftSource !== lazyScene.sourceSession.committedSource} createCommandId={() => `lazy_sequence_${++commandSerial.current}`} onPage={setLazyScene} />}
        {lazyScene.error ? <p role="alert">{lazyScene.error}</p> : null}
        <div className="project-home__actions">
          <button disabled={busy || lazyScene.sourceSession.history.length === 0 || lazyScene.sourceSession.draftSource !== lazyScene.sourceSession.committedSource} onClick={() => setLazyScene((current) => current === null ? current : reduceLazySceneHistory(current, "undo"))}>撤销</button>
          <button disabled={busy || lazyScene.sourceSession.future.length === 0 || lazyScene.sourceSession.draftSource !== lazyScene.sourceSession.committedSource} onClick={() => setLazyScene((current) => current === null ? current : reduceLazySceneHistory(current, "redo"))}>重做</button>
          <button disabled={busy || lazyInputDirty || lazyScene.status !== "dirty"} onClick={() => void saveLazyScene()}>保存当前场景</button>
        </div>
      </section> : lazyScene ? <p role={lazyScene.status === "error" || lazyScene.status === "stale" ? "alert" : "status"}>{lazyScene.error ?? `场景状态：${lazyScene.status}`}</p> : null}
      <div className="project-home__actions">
        <button disabled={busy || lazyPending || routeStale || !routeOverview.overview.window.hasPrevious} onClick={() => void openRouteOverview(routeOverview.item, Math.max(0, routeOverview.overview.window.start - 64))}>上一窗口</button>
        <button disabled={busy || lazyPending || routeStale || !routeOverview.overview.window.hasNext} onClick={() => void openRouteOverview(routeOverview.item, routeOverview.overview.window.end)}>下一窗口</button>
        <button disabled={busy || lazyPending} onClick={() => void run(() => actions.openRecent(routeOverview.item))}>加载完整工程</button>
      </div>
    </section></dialog> : null}
    {selected ? <section className="project-home__card project-home__status" aria-label="工程状态">
      <h2>{selected.title}</h2>
      <dl>
        <div><dt>位置</dt><dd>{selected.reference.displayLocation}</dd></div>
        <div><dt>访问</dt><dd>{selected.access === "editable" ? "可编辑" : `只读：${selected.readOnlyReason}`}</dd></div>
      </dl>
      <div className="project-home__actions">
        <button disabled={busy || selected.project === null} onClick={() => void prepareExport(() => actions.exportArchive(selected))}>准备导出 ZIP</button>
        {download ? <a className="button-like" href={download.href} download={download.filename}>下载工程 ZIP · {(download.byteLength / 1024).toFixed(1)} KiB</a> : null}
      </div>
    </section> : null}
    {busy ? <p className="home-operation-status" role="status">正在打开项目…</p> : null}
    {error && !createOpen && !routeOverview ? <p className="home-operation-status is-error" role="alert">{error}</p> : null}
  </main>;
}
