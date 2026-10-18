import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeProjectEntityReferences, createCharacterEntity, createProjectService, createVariableEntity, executeProjectBatch, markProjectDirty, redoProject, saveLifecycleProject, searchProjectEntities, undoProject, type ProjectCommand, type ProjectLifecycleSession, type ProjectServiceState, type ProjectWorkspace } from "@world-studio/project-domain";
import { ENTITY_LABELS, ProjectEntityDialog, SCOPE_LABELS, TYPE_LABELS, type EntityKind, type EntitySection, type EntityTarget, type EntityValues } from "./project-entity-dialog";
import { StudioIcon } from "./studio-icon";

interface PendingDelete { readonly kind: EntityKind; readonly id: string; readonly name: string; readonly references: ReturnType<typeof analyzeProjectEntityReferences>; }
const defaultId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 16);
const entitySection = (kind: EntityKind): EntitySection => kind === "character" ? "characters" : kind === "variable" ? "variables" : "chapters";

export function ProjectEntityManager({ session, workspace, onSession, onOpenEditor, initialSceneId, initialCreate, returnAfterCreate = false, returnLabel = "进入内容编辑器", idFactory = defaultId }: {
  readonly session: ProjectLifecycleSession; readonly workspace: ProjectWorkspace;
  readonly onSession: (session: ProjectLifecycleSession) => void | Promise<void>;
  readonly onOpenEditor: (project: NonNullable<ProjectLifecycleSession["project"]>, sceneId?: string) => void;
  readonly initialSceneId?: string; readonly initialCreate?: EntityKind; readonly returnAfterCreate?: boolean;
  readonly returnLabel?: string; readonly idFactory?: () => string;
}) {
  const [service, setService] = useState(() => createProjectService(session.project!));
  const [section, setSection] = useState<EntitySection>(initialCreate ? entitySection(initialCreate) : "chapters");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("已同步");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EntityTarget | null>(initialCreate ? { kind: initialCreate, ...(initialCreate === "scene" ? { chapterId: session.project!.chapters.find(chapter => chapter.scenePaths.includes(`scenes/${initialSceneId ?? session.project!.manifest.entrySceneId}.json`))!.id } : {}) } : null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [replacement, setReplacement] = useState("");
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const latestSession = useRef(session);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [savedRevision, setSavedRevision] = useState(0);
  const project = service.project;
  const chapterSceneCount = pendingDelete?.kind === "chapter" ? project.chapters.find(chapter => chapter.id === pendingDelete.id)?.scenePaths.length ?? 0 : 0;
  const currentSceneId = project.scenes.some(scene => scene.id === initialSceneId) ? initialSceneId : project.manifest.entrySceneId;
  const results = useMemo(() => searchProjectEntities(project, query), [project, query]);
  useEffect(() => { latestSession.current = session; }, [session]);
  useEffect(() => { if (pendingDelete && !deleteDialog.current?.open) deleteDialog.current?.showModal(); }, [pendingDelete]);

  const apply = (commands: readonly Record<string, unknown>[]): ProjectServiceState | null => {
    if (saveInFlight.current) return null;
    const result = executeProjectBatch(service, commands.map(command => ({ ...command, commandId: `command_${idFactory()}`, expectedRevision: service.revision })) as ProjectCommand[]);
    if (!result.ok) { setError(result.error.message); return null; }
    setService(result.state); setError(null); setMessage("修改已应用，请保存工程。");
    return result.state;
  };
  const run = (command: Record<string, unknown>) => apply([command]);
  const open = (target: EntityTarget) => { if (saving) return; setError(null); setEditing(target.kind === "scene" && !target.id && !target.chapterId ? { ...target, chapterId: project.chapters.find(chapter => chapter.scenePaths.includes(`scenes/${currentSceneId}.json`))!.id } : target); };
  const close = () => { setEditing(null); setError(null); if (returnAfterCreate) onOpenEditor(project, currentSceneId); };
  const submit = (values: EntityValues) => {
    if (!editing) return;
    try {
      const { kind, id } = editing;
      let state: ProjectServiceState | null;
      let nextSceneId = currentSceneId;
      if (kind === "scene") {
        if (id) {
          const chapter = project.chapters.find(item => item.scenePaths.includes(`scenes/${id}.json`));
          const commands: Record<string, unknown>[] = [];
          if (project.scenes.find(item => item.id === id)?.title !== values.name) commands.push({ kind: "scene.rename", sceneId: id, title: values.name });
          if (chapter?.id !== values.chapterId) commands.push({ kind: "scene.move", sceneId: id, chapterId: values.chapterId, index: project.chapters.find(item => item.id === values.chapterId)!.scenePaths.length });
          state = apply(commands);
        } else {
          nextSceneId = `scene_${idFactory()}`;
          state = apply([{ kind: "scene.create", chapterId: values.chapterId, sceneId: nextSceneId, title: values.name }, { kind: "statement.insert", sceneId: nextSceneId, statement: { id: `statement_${idFactory()}`, kind: "end", endingName: "未命名结局" } }]);
        }
      } else if (kind === "chapter") state = run(id ? { kind: "chapter.rename", chapterId: id, title: values.name } : { kind: "chapter.create", chapterId: `chapter_${idFactory()}`, title: values.name });
      else if (kind === "character") {
        const character = createCharacterEntity(id ?? `character_${idFactory()}`, values.name, values.color, values.portraitSlots.split(",").map(value => value.trim()).filter(Boolean), values.defaultExpression.trim());
        state = run(id ? { kind: "character.update", characterId: id, patch: character } : { kind: "character.create", character });
      } else {
        const value = values.variableType === "boolean" ? values.defaultValue === "true" : values.variableType === "number" ? Number(values.defaultValue) : values.defaultValue;
        const variable = createVariableEntity(id ?? `variable_${idFactory()}`, values.name, values.variableType, value, values.scope);
        state = run(id ? { kind: "variable.update", variableId: id, patch: variable } : { kind: "variable.create", variable });
      }
      if (!state) return;
      setEditing(null);
      if (returnAfterCreate) onOpenEditor(state.project, nextSceneId);
      else setMessage(`${ENTITY_LABELS[kind]}已${id ? "更新" : "创建"}，请保存工程。`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const requestDelete = (kind: EntityKind, id: string, name: string) => { setError(null); setReplacement(""); setPendingDelete({ kind, id, name, references: analyzeProjectEntityReferences(project, id) }); };
  const confirmDelete = () => {
    if (!pendingDelete) return;
    const replacementField = pendingDelete.kind === "scene" ? "replacementSceneId" : pendingDelete.kind === "character" ? "replacementCharacterId" : pendingDelete.kind === "variable" ? "replacementVariableId" : undefined;
    if (run({ kind: `${pendingDelete.kind}.delete`, [`${pendingDelete.kind}Id`]: pendingDelete.id, ...(replacementField && replacement ? { [replacementField]: replacement } : {}) })) setPendingDelete(null);
  };
  const save = async () => {
    if (saveInFlight.current) return;
    saveInFlight.current = true; setSaving(true); setError(null); setMessage("正在保存…");
    try {
      const saved = await saveLifecycleProject(workspace, markProjectDirty(latestSession.current, project));
      latestSession.current = saved;
      await onSession(saved);
      setSavedRevision(service.revision); setMessage("已保存到工程目录");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setMessage("保存未完成，修改仍保留，请重试。"); }
    finally { saveInFlight.current = false; setSaving(false); }
  };
  const moveScene = (sceneId: string, chapterId: string, index: number) => run({ kind: "scene.move", sceneId, chapterId, index });
  const matches = (id: string) => !query || results.some(item => item.id === id);
  const chapterContainsMatch = (id: string, scenePaths: readonly string[]) => matches(id) || scenePaths.some(path => results.some(item => path === `scenes/${item.id}.json`));
  const technical = (id: string) => <details className="entity-technical"><summary>技术信息</summary><code>{id}</code></details>;
  const order = (kind: EntityKind, id: string, name: string, index: number, count: number, chapterId?: string) => <span className="entity-order-actions"><button type="button" aria-label={`${name}上移`} disabled={saving || index === 0} onClick={() => kind === "scene" ? moveScene(id, chapterId!, index - 1) : run({ kind: `${kind}.move`, [`${kind}Id`]: id, index: index - 1 })}>↑</button><button type="button" aria-label={`${name}下移`} disabled={saving || index === count - 1} onClick={() => kind === "scene" ? moveScene(id, chapterId!, index + 1) : run({ kind: `${kind}.move`, [`${kind}Id`]: id, index: index + 1 })}>↓</button></span>;
  const remove = (kind: EntityKind, id: string, name: string) => <button className="entity-delete" type="button" disabled={saving} aria-label={`删除${ENTITY_LABELS[kind]}${name}`} onClick={() => requestDelete(kind, id, name)}>删除</button>;
  return <main className="entity-manager entity-workspace" aria-label="项目结构管理">
    <header className="entity-manager__header"><div><p className="eyebrow"><StudioIcon name="story" />作品内容</p><h1>{project.manifest.title}</h1><p>整理故事的章节、角色和变量，随时回到场景继续创作。</p></div><div className="project-home__actions"><button disabled={saving || !service.undoStack.length} onClick={() => { setService(undoProject(service)); setError(null); setMessage("已撤销，请保存工程。"); }}>撤销</button><button disabled={saving || !service.redoStack.length} onClick={() => { setService(redoProject(service)); setError(null); setMessage("已重做，请保存工程。"); }}>重做</button><button disabled={saving} onClick={() => void save()}>{saving ? "正在保存…" : "保存工程"}</button><button className="studio-primary" disabled={saving} onClick={() => onOpenEditor(project, currentSceneId)}><StudioIcon name="back" />{returnLabel}</button></div></header>
    <p className={`entity-save-status${service.revision !== savedRevision ? " is-dirty" : ""}`} role="status">{message}</p>
    {error && !editing && !pendingDelete && <p role="alert" className="entity-form-error">{error}</p>}
    <div className="entity-workspace-toolbar"><nav className="workspace-section-tabs" aria-label="项目结构分区">{([['chapters', '章节与场景'], ['characters', '角色'], ['variables', '变量']] as const).map(([id, label]) => <button type="button" key={id} disabled={saving} aria-label={label} aria-pressed={section === id} data-color={id === "chapters" ? "violet" : id === "characters" ? "coral" : "teal"} onClick={() => setSection(id)}><StudioIcon name={id === "chapters" ? "story" : id === "characters" ? "characters" : "variables"} />{label}<span>{id === "chapters" ? project.scenes.length : id === "characters" ? project.characters.characters.length : project.variables.variables.length}</span></button>)}</nav><label className="entity-search"><StudioIcon name="search" /><input aria-label="搜索全部实体" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索名称或 ID…" /></label></div>
    {query && <ul className="entity-search-results" aria-label="搜索结果">{results.map(item => <li key={`${item.kind}:${item.id}`}><button disabled={saving} onClick={() => { const kind = item.kind as EntityKind; setSection(entitySection(kind)); open({ kind, id: item.id }); }}>{item.label}<small>{item.detail}</small></button></li>)}</ul>}
    <section hidden={section !== "chapters"} className="entity-content-section" aria-labelledby="chapters-heading">
      <div className="entity-section-heading"><div><h2 id="chapters-heading">章节与场景</h2><p>章节组织故事，点击场景开始写作。</p></div><div><button disabled={saving} onClick={() => open({ kind: "chapter" })}><StudioIcon name="plus" />新增章节</button><button className="studio-primary" disabled={saving} onClick={() => open({ kind: "scene" })}><StudioIcon name="plus" />新增场景</button></div></div>
      <ol className="entity-chapter-list">{project.chapters.filter(chapter => chapterContainsMatch(chapter.id, chapter.scenePaths)).map(chapter => {
        const chapterIndex = project.chapters.findIndex(item => item.id === chapter.id);
        return <li key={chapter.id} className="entity-chapter"><header><span className="entity-symbol"><StudioIcon name="story" /></span><div><h3>{chapter.title}</h3><small>{chapter.scenePaths.length} 个场景</small></div><div className="entity-row-actions"><button disabled={saving} aria-label={`编辑章节：${chapter.title}`} onClick={() => open({ kind: "chapter", id: chapter.id })}>编辑</button>{order("chapter", chapter.id, chapter.title, chapterIndex, project.chapters.length)}{remove("chapter", chapter.id, chapter.title)}</div></header><ol>{chapter.scenePaths.map((path, index) => { const scene = project.scenes.find(item => `scenes/${item.id}.json` === path); if (!scene || (query && !matches(chapter.id) && !matches(scene.id))) return null; return <li className="entity-scene" key={scene.id}><span className="entity-scene-number">{String(index + 1).padStart(2, "0")}</span><div className="entity-row-title"><strong>{scene.title}</strong><small>{project.scripts[scene.id]?.statements.length ?? 0} 个步骤{project.manifest.entrySceneId === scene.id ? " · 游戏开场" : ""}</small>{technical(scene.id)}</div><div className="entity-row-actions"><button disabled={saving} className="entity-write" aria-label={`编辑场景：${scene.title}`} onClick={() => onOpenEditor(project, scene.id)}><StudioIcon name="write" />写作</button><button disabled={saving} aria-label={`修改场景：${scene.title}`} onClick={() => open({ kind: "scene", id: scene.id })}>编辑</button>{project.manifest.entrySceneId !== scene.id && <button disabled={saving} onClick={() => run({ kind: "scene.set-entry", sceneId: scene.id })}>设为入口</button>}{order("scene", scene.id, scene.title, index, chapter.scenePaths.length, chapter.id)}{remove("scene", scene.id, scene.title)}</div></li>; })}</ol><button className="entity-chapter-add" disabled={saving} aria-label={`向${chapter.title}添加场景`} onClick={() => open({ kind: "scene", chapterId: chapter.id })}><StudioIcon name="plus" />添加场景</button></li>;
      })}</ol>
    </section>
    <section hidden={section !== "characters"} className="entity-content-section" aria-labelledby="characters-heading"><div className="entity-section-heading"><div><h2 id="characters-heading">角色</h2><p>为对白选择说话的人。颜色帮助区分角色。</p></div><button className="studio-primary" disabled={saving} onClick={() => open({ kind: "character" })}><StudioIcon name="plus" />新增角色</button></div>
      {!project.characters.characters.length && <div className="entity-empty"><StudioIcon name="characters" /><h3>故事里的第一位角色</h3><p>输入名字即可开始写对白，立绘可以稍后添加。</p></div>}
      <ul className="entity-character-list">{project.characters.characters.filter(item => matches(String(item.id))).map(character => { const id = String(character.id), name = String(character.displayName), index = project.characters.characters.findIndex(item => item.id === id); return <li key={id} className="entity-character"><span className="entity-avatar" style={{ backgroundColor: String(character.color) }}>{name.slice(0, 1)}</span><div className="entity-row-title"><h3>{name}</h3><small>{Array.isArray(character.portraitSlots) ? character.portraitSlots.length : 1} 个立绘槽位</small>{technical(id)}</div><div className="entity-row-actions"><button disabled={saving} aria-label={`编辑角色：${name}`} onClick={() => open({ kind: "character", id })}>编辑</button>{order("character", id, name, index, project.characters.characters.length)}{remove("character", id, name)}</div></li>; })}</ul>
    </section>
    <section hidden={section !== "variables"} className="entity-content-section" aria-labelledby="variables-heading"><div className="entity-section-heading"><div><h2 id="variables-heading">变量</h2><p>记录好感度、已做出的选择和路线条件。</p></div><button className="studio-primary" disabled={saving} onClick={() => open({ kind: "variable" })}><StudioIcon name="plus" />新增变量</button></div>
      {!project.variables.variables.length && <div className="entity-empty"><StudioIcon name="variables" /><h3>让选择影响故事</h3><p>例如用数值记录好感度，或用开关记录是否找到线索。</p></div>}
      <ul className="entity-variable-list">{project.variables.variables.filter(item => matches(String(item.id))).map(variable => { const id = String(variable.id), name = String(variable.name), index = project.variables.variables.findIndex(item => item.id === id); return <li key={id} className="entity-variable"><span className="entity-symbol" data-kind="variable"><StudioIcon name="variables" /></span><div className="entity-row-title"><h3>{name}</h3><small>{TYPE_LABELS[variable.type as keyof typeof TYPE_LABELS]} · 初始值 {typeof variable.defaultValue === "boolean" ? variable.defaultValue ? "是" : "否" : String(variable.defaultValue)} · {SCOPE_LABELS[variable.scope as keyof typeof SCOPE_LABELS]}</small>{technical(id)}</div><div className="entity-row-actions"><button disabled={saving} aria-label={`编辑变量：${name}`} onClick={() => open({ kind: "variable", id })}>编辑</button>{order("variable", id, name, index, project.variables.variables.length)}{remove("variable", id, name)}</div></li>; })}</ul>
    </section>
    {editing && <ProjectEntityDialog key={`${editing.kind}:${editing.id ?? "new"}`} project={project} target={editing} returnAfterCreate={returnAfterCreate} error={error} onSubmit={submit} onClose={close} />}
    {pendingDelete && <dialog ref={deleteDialog} className="entity-edit-dialog entity-delete-dialog" role="alertdialog" aria-label="删除前引用分析" onCancel={() => { setPendingDelete(null); setError(null); }}><h2>删除“{pendingDelete.name}”？</h2>{chapterSceneCount > 0 && <p>章节仍包含 {chapterSceneCount} 个场景，请先移动或删除这些场景。</p>}<p>{pendingDelete.references.length ? `这项内容有 ${pendingDelete.references.length} 处引用。请先决定如何处理。` : "删除后可以通过撤销恢复。"}</p>{pendingDelete.references.length > 0 && <><details><summary>查看使用位置</summary><ul>{pendingDelete.references.map(item => <li key={item.path}><code>{item.path}</code></li>)}</ul></details>{pendingDelete.kind === "chapter" ? <p>章节仍包含场景，请先移动或删除这些场景。</p> : <label>将引用改为<select aria-label="替代实体" value={replacement} onChange={event => setReplacement(event.target.value)}><option value="">请选择替代内容</option>{(pendingDelete.kind === "scene" ? project.scenes : pendingDelete.kind === "character" ? project.characters.characters : project.variables.variables).filter(item => item.id !== pendingDelete.id).map(item => <option key={String(item.id)} value={String(item.id)}>{String("title" in item ? item.title : "displayName" in item ? item.displayName : item.name)}</option>)}</select></label>}</>}{error && <p role="alert" className="entity-form-error">{error}</p>}<footer><button onClick={() => { setPendingDelete(null); setError(null); }}>取消</button><button className="entity-danger" disabled={chapterSceneCount > 0 || (pendingDelete.references.length > 0 && (pendingDelete.kind === "chapter" || !replacement))} onClick={confirmDelete}>{pendingDelete.references.length ? "迁移引用并删除" : "确认删除"}</button></footer></dialog>}
  </main>;
}
