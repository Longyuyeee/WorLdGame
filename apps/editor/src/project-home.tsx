import { useEffect, useState, type FormEvent } from "react";
import type { ProjectLifecycleSession, RecentProject } from "@world-studio/project-domain";

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
        : <ul className="project-home__recent">{recent.map((item) => <li key={item.reference.referenceId}><button disabled={busy} onClick={() => void run(() => actions.openRecent(item))}><strong>{item.title}</strong><span>{item.reference.displayLocation}</span></button></li>)}</ul>}
    </section>
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
