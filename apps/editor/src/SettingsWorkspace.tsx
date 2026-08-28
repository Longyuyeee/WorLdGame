import { useEffect, useMemo, useRef, useState } from "react";
import {
  GAL_SETTING_DEFINITIONS,
  GAL_SETTINGS_PLATFORMS,
  resolveGalSettings,
  searchGalSettingDefinitions,
  type GalSettingDefinition,
  type GalSettingPath,
  type GalSettingScalar,
  type GalSettingsCatalogMode,
  type GalSettingsEdit,
  type GalSettingsEditLayer,
  type GalSettingsPlatform
} from "@world-studio/gal-settings";
import {
  createProjectService,
  executeProjectCommand,
  redoProject,
  undoProject,
  type CanonicalProject,
  type ProjectServiceState
} from "@world-studio/project-domain";

export type SettingsSaveStatus = "loading" | "migrating" | "readonly" | "blocked" | "conflict" | "unavailable" | "unsaved" | "dirty" | "saving" | "autosaving" | "saved" | "autosaved" | "restored" | "degraded" | "error";

export interface SettingsWorkspaceProps {
  readonly project: CanonicalProject;
  readonly saveStatus: SettingsSaveStatus;
  readonly saveDetail?: string;
  readonly onProjectChange: (project: CanonicalProject) => void;
  readonly onSave: () => void;
  readonly onClose: () => void;
}

type DraftEdit = Extract<GalSettingsEdit, { readonly type: "set" }> | Extract<GalSettingsEdit, { readonly type: "reset" }>;
type SettingsLayerId = "project" | GalSettingsPlatform;

const SECTION_LABELS = {
  display: "显示与平台",
  text: "文本与消息窗",
  advance: "推进",
  audio: "音频",
  input: "输入",
  accessibility: "无障碍"
} as const;

const SOURCE_LABELS = {
  default: "默认值",
  project: "项目值",
  windows: "Windows 覆盖",
  web: "Web 覆盖",
  android: "Android 覆盖"
} as const;

const OPTION_LABELS: Readonly<Record<string, string>> = {
  landscape: "横屏",
  portrait: "竖屏",
  adaptive: "自适应",
  none: "不额外避让",
  system: "跟随系统安全区",
  low: "低",
  balanced: "均衡",
  high: "高",
  typewriter: "逐字显示",
  instant: "立即显示"
};

function layerFromId(id: SettingsLayerId): GalSettingsEditLayer {
  return id === "project" ? { kind: "project" } : { kind: "platform", platform: id };
}

function layerOverride(project: CanonicalProject, id: SettingsLayerId) {
  return id === "project" ? project.settings.project : project.settings.platforms[id];
}

function overrideFact(project: CanonicalProject, id: SettingsLayerId, path: GalSettingPath): { readonly present: boolean; readonly value: GalSettingScalar | null } {
  const [section, field] = path.split(".") as [keyof ReturnType<typeof resolveGalSettings>["values"], string];
  const sectionValue = layerOverride(project, id)[section] as Record<string, GalSettingScalar> | undefined;
  const present = Object.prototype.hasOwnProperty.call(sectionValue ?? {}, field);
  return { present, value: present ? sectionValue?.[field] ?? null : null };
}

function resolvedValue(project: CanonicalProject, platform: GalSettingsPlatform, path: GalSettingPath): GalSettingScalar {
  const [section, field] = path.split(".") as [keyof ReturnType<typeof resolveGalSettings>["values"], string];
  const values = resolveGalSettings(project.settings, platform).values[section] as Record<string, GalSettingScalar>;
  return values[field] as GalSettingScalar;
}

function draftKey(layer: SettingsLayerId, path: GalSettingPath): string {
  return `${layer}:${path}`;
}

function unitLabel(definition: GalSettingDefinition): string {
  if (definition.control.kind !== "number" || definition.control.unit === undefined) return "";
  if (definition.control.unit === "characters-per-second") return "字/秒";
  if (definition.control.unit === "ratio") return "×";
  return definition.control.unit;
}

function saveStatusLabel(status: SettingsSaveStatus): string {
  if (status === "saving") return "正在保存工程…";
  if (status === "autosaving") return "正在自动保存…";
  if (status === "saved") return "工程已保存";
  if (status === "autosaved") return "工程已自动保存";
  if (status === "dirty") return "有未保存设置";
  if (status === "conflict") return "保存冲突，未覆盖远端版本";
  if (status === "readonly" || status === "blocked") return "当前工程只读";
  if (status === "unavailable") return "本地保存不可用";
  if (status === "loading") return "正在校验工程存储…";
  if (status === "error") return "保存失败，源工程未被覆盖";
  return "设置已接入工程事务";
}

export function SettingsWorkspace({ project, saveStatus, saveDetail, onProjectChange, onSave, onClose }: SettingsWorkspaceProps) {
  const [service, setService] = useState<ProjectServiceState>(() => createProjectService(project));
  const [mode, setMode] = useState<GalSettingsCatalogMode>("basic");
  const [layerId, setLayerId] = useState<SettingsLayerId>("project");
  const [previewPlatform, setPreviewPlatform] = useState<GalSettingsPlatform>("windows");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<"all" | keyof typeof SECTION_LABELS>("all");
  const [drafts, setDrafts] = useState<Readonly<Record<string, DraftEdit>>>({});
  const [message, setMessage] = useState("选择一项修改；同一分区的关联字段会作为一个原子 ChangeSet 提交。");
  const [errorPath, setErrorPath] = useState<string | null>(null);
  const commandSerial = useRef(0);

  useEffect(() => {
    if (service.project.manifest.projectId === project.manifest.projectId) return;
    setService(createProjectService(project));
    setDrafts({});
    setMessage("已切换工程，设置事务从新工程重新开始。");
  }, [project, service.project.manifest.projectId]);

  const activePlatform = layerId === "project" ? previewPlatform : layerId;
  const resolved = useMemo(() => resolveGalSettings(service.project.settings, activePlatform), [activePlatform, service.project.settings]);
  const definitions = useMemo(() => searchGalSettingDefinitions(query, {
    mode,
    ...(section === "all" ? {} : { section })
  }), [mode, query, section]);
  const activeOverrideCount = GAL_SETTING_DEFINITIONS.filter((definition) => overrideFact(service.project, layerId, definition.path).present).length;
  const activeDrafts = Object.entries(drafts).filter(([key]) => key.startsWith(`${layerId}:`));

  const stageSet = (path: GalSettingPath, value: GalSettingScalar) => {
    setDrafts((current) => ({ ...current, [draftKey(layerId, path)]: { type: "set", path, value } as DraftEdit }));
    setErrorPath(null);
    setMessage("修改尚未进入工程；点击分区的“应用修改”后才会创建一个原子 ChangeSet。");
  };
  const stageReset = (path: GalSettingPath) => {
    setDrafts((current) => ({ ...current, [draftKey(layerId, path)]: { type: "reset", path } as DraftEdit }));
    setErrorPath(null);
    setMessage(layerId === "project" ? "已暂存恢复默认；应用后删除项目覆盖。" : "已暂存恢复继承；应用后删除当前平台覆盖。");
  };
  const discardDraft = (path: GalSettingPath) => {
    setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== draftKey(layerId, path))));
    setErrorPath(null);
    setMessage("已放弃这项尚未提交的修改。");
  };
  const commit = (edits: readonly GalSettingsEdit[], label: string) => {
    const result = executeProjectCommand(service, {
      commandId: `command_settings_ui_${++commandSerial.current}`,
      expectedRevision: service.revision,
      kind: "settings.edit",
      layer: layerFromId(layerId),
      edits
    });
    if (!result.ok) {
      setErrorPath(result.error.path ?? null);
      setMessage(`${result.error.code}：${result.error.message}`);
      return false;
    }
    setService(result.state);
    onProjectChange(result.state.project);
    setErrorPath(null);
    setMessage(`${label}已提交 · ChangeSet r${result.changeSet.revision} · 等待保存工程`);
    return true;
  };
  const applySection = (targetSection: keyof typeof SECTION_LABELS) => {
    const edits = GAL_SETTING_DEFINITIONS
      .filter((definition) => definition.section === targetSection)
      .flatMap((definition) => drafts[draftKey(layerId, definition.path)] ?? []);
    if (edits.length === 0) return;
    if (!commit(edits, SECTION_LABELS[targetSection])) return;
    const paths = new Set(edits.map((edit) => draftKey(layerId, edit.path)));
    setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !paths.has(key))));
  };
  const resetLayer = () => {
    const edits = GAL_SETTING_DEFINITIONS
      .filter((definition) => overrideFact(service.project, layerId, definition.path).present)
      .map((definition) => ({ type: "reset", path: definition.path }) as GalSettingsEdit);
    if (edits.length === 0) {
      setMessage("当前层没有覆盖值，不会创建空 revision。");
      return;
    }
    if (!commit(edits, layerId === "project" ? "项目层恢复默认" : `${layerId} 恢复继承`)) return;
    setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${layerId}:`))));
  };
  const undo = () => {
    const next = undoProject(service);
    if (next === service) return;
    setService(next);
    setDrafts({});
    setErrorPath(null);
    setMessage(`已撤销设置 ChangeSet · 当前事务 r${next.revision} · 等待保存工程`);
    onProjectChange(next.project);
  };
  const redo = () => {
    const next = redoProject(service);
    if (next === service) return;
    setService(next);
    setDrafts({});
    setErrorPath(null);
    setMessage(`已重做设置 ChangeSet · 当前事务 r${next.revision} · 等待保存工程`);
    onProjectChange(next.project);
  };

  const grouped = Object.entries(SECTION_LABELS).flatMap(([sectionId, label]) => {
    const items = definitions.filter((definition) => definition.section === sectionId);
    return items.length === 0 ? [] : [{ id: sectionId as keyof typeof SECTION_LABELS, label, items }];
  });

  return (
    <section className="settings-workspace" aria-labelledby="settings-heading">
      <header className="settings-workspace__hero">
        <div>
          <p className="eyebrow">CANONICAL PROJECT SETTINGS</p>
          <h2 id="settings-heading">项目设置</h2>
          <p>编辑默认与平台覆盖值；所有应用、撤销和重做都进入同一 Project Service 事务链。</p>
        </div>
        <div className="settings-workspace__hero-actions">
          <button type="button" className="settings-secondary" onClick={onClose}>返回创作</button>
          <button type="button" className="settings-save" onClick={onSave} disabled={["saving", "autosaving", "loading", "readonly", "blocked", "unavailable"].includes(saveStatus)}>保存工程</button>
        </div>
      </header>

      <div className="settings-command-bar">
        <div className="settings-mode-switch" role="radiogroup" aria-label="设置复杂度">
          {(["basic", "advanced"] as const).map((candidate) => <button type="button" role="radio" aria-checked={mode === candidate} className={mode === candidate ? "is-active" : ""} key={candidate} onClick={() => setMode(candidate)}>{candidate === "basic" ? "Basic" : "Advanced"}</button>)}
        </div>
        <label className="settings-search">
          <span className="sr-only">搜索项目设置</span>
          <input type="search" value={query} placeholder="搜索名称、说明或路径…" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <select aria-label="设置分区" value={section} onChange={(event) => setSection(event.target.value as typeof section)}>
          <option value="all">全部分区</option>
          {Object.entries(SECTION_LABELS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
        </select>
      </div>

      <div className="settings-layer-row">
        <div className="settings-layer-switch" role="radiogroup" aria-label="设置作用层">
          {(["project", ...GAL_SETTINGS_PLATFORMS] as const).map((candidate) => <button type="button" role="radio" aria-checked={layerId === candidate} className={layerId === candidate ? "is-active" : ""} key={candidate} onClick={() => { setLayerId(candidate); if (candidate !== "project") setPreviewPlatform(candidate); }}>{candidate === "project" ? "项目" : candidate === "windows" ? "Windows" : candidate === "web" ? "Web" : "Android"}</button>)}
        </div>
        {layerId === "project" && <label className="settings-preview-platform">来源预览<select value={previewPlatform} onChange={(event) => setPreviewPlatform(event.target.value as GalSettingsPlatform)}>{GAL_SETTINGS_PLATFORMS.map((platform) => <option value={platform} key={platform}>{platform === "windows" ? "Windows" : platform === "web" ? "Web" : "Android"}</option>)}</select></label>}
        <div className="settings-layer-summary"><strong>{activeOverrideCount}</strong> 当前层覆盖 · <strong>{activeDrafts.length}</strong> 待应用</div>
        <button type="button" className="settings-reset-layer" onClick={resetLayer} disabled={activeOverrideCount === 0}>{layerId === "project" ? "恢复项目默认" : "恢复平台继承"}</button>
      </div>

      <div className={`settings-feedback settings-feedback--${saveStatus}`} role={errorPath === null ? "status" : "alert"} aria-live="polite">
        <span aria-hidden="true">{errorPath === null ? "✓" : "!"}</span>
        <div><strong>{message}</strong><small>{saveStatusLabel(saveStatus)}{saveDetail === undefined ? "" : ` · ${saveDetail}`}{errorPath === null ? "" : ` · ${errorPath}`}</small></div>
        <div className="settings-history-actions" aria-label="设置事务历史">
          <button type="button" onClick={undo} disabled={service.undoStack.length === 0}>撤销</button>
          <button type="button" onClick={redo} disabled={service.redoStack.length === 0}>重做</button>
        </div>
      </div>

      <div className="settings-results-summary"><strong>{definitions.length}</strong> 项可见 · {mode === "basic" ? "核心配置" : "全部首批配置"}<span>当前解析平台：{activePlatform}</span></div>
      <div className="settings-sections">
        {grouped.length === 0 ? <div className="settings-empty" role="status"><strong>没有匹配的设置</strong><span>尝试清除搜索或切换 Advanced。</span></div> : grouped.map((group) => {
          const pendingCount = group.items.filter((definition) => drafts[draftKey(layerId, definition.path)] !== undefined).length;
          return <section className="settings-section" aria-labelledby={`settings-section-${group.id}`} key={group.id}>
            <header><div><p className="eyebrow">{group.id.toUpperCase()}</p><h3 id={`settings-section-${group.id}`}>{group.label}</h3></div><button type="button" onClick={() => applySection(group.id)} disabled={pendingCount === 0}>应用修改{pendingCount === 0 ? "" : ` · ${pendingCount}`}</button></header>
            <div className="settings-card-grid">{group.items.map((definition) => {
              const fact = overrideFact(service.project, layerId, definition.path);
              const draft = drafts[draftKey(layerId, definition.path)];
              const value = draft?.type === "set" ? draft.value : resolvedValue(service.project, activePlatform, definition.path);
              const source = resolved.sources[definition.path];
              return <article className={`settings-card${draft === undefined ? "" : " is-dirty"}${fact.present ? " is-overridden" : ""}`} data-setting-path={definition.path} key={definition.path}>
                <div className="settings-card__heading"><div><strong>{definition.label.zhHans}</strong><code>{definition.path}</code></div><div className="settings-card__badges"><span className={`settings-source settings-source--${source}`}>{SOURCE_LABELS[source]}</span>{definition.level === "advanced" && <span>ADV</span>}</div></div>
                <p>{definition.description.zhHans}</p>
                <div className="settings-control">
                  {definition.control.kind === "boolean" ? <label className="settings-toggle"><input type="checkbox" aria-label={definition.label.zhHans} checked={Boolean(value)} onChange={(event) => stageSet(definition.path, event.target.checked)} /><span aria-hidden="true" /><b>{Boolean(value) ? "开启" : "关闭"}</b></label>
                    : definition.control.kind === "select" ? <select aria-label={definition.label.zhHans} value={String(value)} onChange={(event) => stageSet(definition.path, event.target.value as GalSettingScalar)}>{definition.control.options.map((option) => <option value={option} key={option}>{OPTION_LABELS[option] ?? option}</option>)}</select>
                    : <label className="settings-number"><input aria-label={definition.label.zhHans} type="number" min={definition.control.minimum} max={definition.control.maximum} step={definition.control.step} value={Number(value)} onChange={(event) => { if (Number.isFinite(event.target.valueAsNumber)) stageSet(definition.path, event.target.valueAsNumber); }} /><span>{unitLabel(definition)}</span></label>}
                </div>
                <div className="settings-card__footer"><span>{draft === undefined ? fact.present ? "当前层已覆盖" : "继承生效值" : draft.type === "reset" ? "待恢复继承" : "待应用修改"}</span><div>{draft !== undefined && <button type="button" onClick={() => discardDraft(definition.path)}>放弃</button>}<button type="button" onClick={() => stageReset(definition.path)} disabled={!fact.present && draft === undefined}>{layerId === "project" ? "恢复默认" : "恢复继承"}</button></div></div>
              </article>;
            })}</div>
          </section>;
        })}
      </div>
    </section>
  );
}
