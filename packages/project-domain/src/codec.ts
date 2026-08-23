import { sha256 } from "./sha256";
import { ProjectDomainError, type CanonicalProject, type ChapterDocument, type JsonObject, type JsonValue, type LayoutDocument, type LayoutGroup, type LayoutNodePosition, type LayoutViewport, type ProjectFiles, type ProjectManifest, type ProjectProbe, type ProjectStructureIndex, type SceneDocument } from "./types";

export const PROJECT_MANIFEST_PATH = "world.project.json";
const ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const PATH = /^(?:[a-z0-9._-]+\/)*[a-z0-9._-]+\.json$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isJson = (value: unknown): value is JsonValue => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (Array.isArray(value) && value.every(isJson)) || (isRecord(value) && Object.values(value).every(isJson));
const fail = (code: ConstructorParameters<typeof ProjectDomainError>[0], message: string): never => { throw new ProjectDomainError(code, message); };

function parse(files: ProjectFiles, path: string): Record<string, unknown> {
  const source = files[path]; if (source === undefined) return fail("MISSING_FILE", `Missing project file: ${path}`);
  try { const value: unknown = JSON.parse(source); return isRecord(value) ? value : fail("INVALID_SCHEMA", `${path} root must be an object`); }
  catch (error) { if (error instanceof ProjectDomainError) throw error; return fail("INVALID_JSON", `${path} is not valid JSON`); }
}
function string(value: unknown, label: string): string { return typeof value === "string" && value.length > 0 ? value : fail("INVALID_SCHEMA", `${label} must be a non-empty string`); }
function id(value: unknown, label: string): string { const result = string(value, label); return ID.test(result) ? result : fail("INVALID_ID", `${label} is not a portable stable ID: ${result}`); }
function path(value: unknown, label: string): string { const result = string(value, label); return PATH.test(result) && !result.includes("..") ? result : fail("INVALID_SCHEMA", `${label} is not a canonical JSON path`); }
function strings(value: unknown, label: string, mapper = string): string[] { return Array.isArray(value) ? value.map((item, index) => mapper(item, `${label}[${index}]`)) : fail("INVALID_SCHEMA", `${label} must be an array`); }
function objects(value: unknown, label: string): JsonObject[] { return Array.isArray(value) && value.every((item) => isRecord(item) && isJson(item)) ? value as JsonObject[] : fail("INVALID_SCHEMA", `${label} must contain JSON objects`); }
function layoutNodes(value: unknown, label: string): LayoutNodePosition[] {
  if (!Array.isArray(value)) return fail("INVALID_SCHEMA", `${label} must be an array`);
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) return fail("INVALID_SCHEMA", `${label}[${index}] must be an object`);
    const nodeId = id(item.nodeId, `${label}[${index}].nodeId`);
    if (seen.has(nodeId)) return fail("DUPLICATE_ID", `${label} contains duplicate node ${nodeId}`);
    if (typeof item.x !== "number" || !Number.isFinite(item.x) || typeof item.y !== "number" || !Number.isFinite(item.y)) return fail("INVALID_SCHEMA", `${label}[${index}] coordinates must be finite numbers`);
    const groupId = item.groupId === undefined ? undefined : id(item.groupId, `${label}[${index}].groupId`);
    const unknown = preserved(item, ["nodeId", "x", "y", "groupId"]);
    if (unknown !== undefined) return fail("INVALID_SCHEMA", `${label}[${index}] contains unsupported fields`);
    seen.add(nodeId);
    return { nodeId, x: item.x, y: item.y, ...(groupId === undefined ? {} : { groupId }) };
  });
}
function layoutGroups(value: unknown, label: string): LayoutGroup[] {
  if (!Array.isArray(value)) return fail("INVALID_SCHEMA", `${label} must be an array`);const seen=new Set<string>();
  return value.map((item,index)=>{if(!isRecord(item))return fail("INVALID_SCHEMA",`${label}[${index}] must be an object`);const groupId=id(item.groupId,`${label}[${index}].groupId`);if(seen.has(groupId))return fail("DUPLICATE_ID",`${label} contains duplicate group ${groupId}`);const title=string(item.title,`${label}[${index}].title`);if(typeof item.collapsed!=="boolean")return fail("INVALID_SCHEMA",`${label}[${index}].collapsed must be boolean`);if(preserved(item,["groupId","title","collapsed"])!==undefined)return fail("INVALID_SCHEMA",`${label}[${index}] contains unsupported fields`);seen.add(groupId);return {groupId,title,collapsed:item.collapsed};});
}
function layoutViewport(value: unknown,label:string):LayoutViewport { if(!isRecord(value)||typeof value.x!=="number"||!Number.isFinite(value.x)||typeof value.y!=="number"||!Number.isFinite(value.y)||typeof value.zoom!=="number"||!Number.isFinite(value.zoom)||value.zoom<0.5||value.zoom>2)return fail("INVALID_SCHEMA",`${label} must contain finite x/y and zoom from 0.5 to 2`);if(preserved(value,["x","y","zoom"])!==undefined)return fail("INVALID_SCHEMA",`${label} contains unsupported fields`);return {x:value.x,y:value.y,zoom:value.zoom}; }
function preserved(data: Record<string, unknown>, known: readonly string[]): JsonObject | undefined { const entries = Object.entries(data).filter(([key]) => !known.includes(key)); if (entries.length === 0) return undefined; if (entries.some(([, value]) => !isJson(value))) return fail("INVALID_SCHEMA", "Unknown fields must be JSON values"); return Object.fromEntries(entries) as JsonObject; }
function version(data: Record<string, unknown>, file: string): void { if (data.schemaVersion !== 1) { if (Number.isSafeInteger(data.schemaVersion) && (data.schemaVersion as number) > 1) fail("FUTURE_SCHEMA", `${file} uses future schema ${data.schemaVersion as number}`); fail("INVALID_SCHEMA", `${file} must use schemaVersion 1`); } }
function arrayDocument(files: ProjectFiles, file: string, field: string): object { const data=parse(files,file); version(data,file); const result={schemaVersion:1 as const,[field]:objects(data[field],`${file}.${field}`)}; const unknown=preserved(data,["schemaVersion",field]); return unknown ? {...result,preservedFields:unknown}:result; }
function valueDocument(files: ProjectFiles, file: string): { schemaVersion: 1; values: JsonObject; preservedFields?: JsonObject } { const data=parse(files,file); version(data,file); if(!isRecord(data.values)||!isJson(data.values)) fail("INVALID_SCHEMA",`${file}.values must be a JSON object`); const unknown=preserved(data,["schemaVersion","values"]); return unknown ? {schemaVersion:1,values:data.values as JsonObject,preservedFields:unknown}:{schemaVersion:1,values:data.values as JsonObject}; }

export function probeProject(files: ProjectFiles): ProjectProbe {
  const data=parse(files,PROJECT_MANIFEST_PATH); const schema=data.schemaVersion;
  if (!Number.isSafeInteger(schema) || (schema as number) < 1) return fail("INVALID_SCHEMA","manifest schemaVersion is invalid");
  if ((schema as number)>1) return {status:"future-read-only",schemaVersion:schema as number,...(typeof data.projectId==="string"?{projectId:data.projectId}:{}),...(typeof data.title==="string"?{title:data.title}:{})};
  return {status:"current",schemaVersion:1,projectId:id(data.projectId,"projectId"),title:string(data.title,"title")};
}

export function loadProjectManifest(files: ProjectFiles): ProjectManifest {
  const probe=probeProject(files); if(probe.status!=="current") return fail("FUTURE_SCHEMA",`Project schema ${probe.schemaVersion} is read-only`);
  const data=parse(files,PROJECT_MANIFEST_PATH); version(data,PROJECT_MANIFEST_PATH);
  const manifestKnown=["schemaVersion","fileVersion","projectId","title","defaultLocale","entrySceneId","chapterPaths","charactersPath","variablesPath","assetsPath","localizationPath","settingsPath","uiPath","pluginsPath","testRoutesPath"];
  if(data.fileVersion!=="1.0.0") fail("INVALID_SCHEMA","fileVersion must be 1.0.0");
  const manifestBase={schemaVersion:1 as const,fileVersion:"1.0.0" as const,projectId:id(data.projectId,"projectId"),title:string(data.title,"title"),defaultLocale:string(data.defaultLocale,"defaultLocale"),entrySceneId:id(data.entrySceneId,"entrySceneId"),chapterPaths:strings(data.chapterPaths,"chapterPaths",path),charactersPath:path(data.charactersPath,"charactersPath"),variablesPath:path(data.variablesPath,"variablesPath"),assetsPath:path(data.assetsPath,"assetsPath"),localizationPath:path(data.localizationPath,"localizationPath"),settingsPath:path(data.settingsPath,"settingsPath"),uiPath:path(data.uiPath,"uiPath"),pluginsPath:path(data.pluginsPath,"pluginsPath"),testRoutesPath:path(data.testRoutesPath,"testRoutesPath")};
  const manifestUnknown=preserved(data,manifestKnown); return manifestUnknown?{...manifestBase,preservedFields:manifestUnknown}:manifestBase;
}

export function loadProjectChapters(files: ProjectFiles, manifest: ProjectManifest): readonly ChapterDocument[] {
  return manifest.chapterPaths.map((file)=>{const value=parse(files,file);version(value,file);const base={schemaVersion:1 as const,id:id(value.id,`${file}.id`),title:string(value.title,`${file}.title`),scenePaths:strings(value.scenePaths,`${file}.scenePaths`,path)};const unknown=preserved(value,["schemaVersion","id","title","scenePaths"]);return unknown?{...base,preservedFields:unknown}:base;});
}

export function loadProjectScenes(files: ProjectFiles, chapters: readonly ChapterDocument[]): readonly SceneDocument[] {
  const scenePaths=chapters.flatMap((chapter)=>chapter.scenePaths); return scenePaths.map((file)=>{const value=parse(files,file);version(value,file);const base={schemaVersion:1 as const,id:id(value.id,`${file}.id`),title:string(value.title,`${file}.title`),scriptPath:path(value.scriptPath,`${file}.scriptPath`),layoutPath:path(value.layoutPath,`${file}.layoutPath`)};const unknown=preserved(value,["schemaVersion","id","title","scriptPath","layoutPath"]);return unknown?{...base,preservedFields:unknown}:base;});
}

export function loadProjectStructure(files: ProjectFiles): ProjectStructureIndex {
  const manifest=loadProjectManifest(files),chapters=loadProjectChapters(files,manifest),scenes=loadProjectScenes(files,chapters);
  const allIds=[manifest.projectId,...chapters.map((item)=>item.id),...scenes.map((item)=>item.id)]; if(new Set(allIds).size!==allIds.length) fail("DUPLICATE_ID","Project, chapter, and scene stable IDs must be unique"); if(!scenes.some((scene)=>scene.id===manifest.entrySceneId)) fail("BROKEN_REFERENCE","entrySceneId does not reference a scene");
  return {schemaVersion:1,manifest,chapters,scenes};
}

export function loadProjectLayouts(files: ProjectFiles, scenes: readonly SceneDocument[]): Readonly<Record<string, LayoutDocument>> {
  return Object.fromEntries(scenes.map((scene)=>{const value=parse(files,scene.layoutPath);version(value,scene.layoutPath);if(id(value.sceneId,`${scene.layoutPath}.sceneId`)!==scene.id) fail("BROKEN_REFERENCE",`${scene.layoutPath} belongs to another scene`);const base={schemaVersion:1 as const,sceneId:scene.id,nodes:layoutNodes(value.nodes,`${scene.layoutPath}.nodes`),...(value.groups===undefined?{}:{groups:layoutGroups(value.groups,`${scene.layoutPath}.groups`)}),...(value.viewport===undefined?{}:{viewport:layoutViewport(value.viewport,`${scene.layoutPath}.viewport`)})};const unknown=preserved(value,["schemaVersion","sceneId","nodes","groups","viewport"]);return [scene.id,unknown?{...base,preservedFields:unknown}:base];}));
}

export function loadProject(files: ProjectFiles): CanonicalProject {
  const {manifest,chapters,scenes}=loadProjectStructure(files);
  const scripts=Object.fromEntries(scenes.map((scene)=>{const value=parse(files,scene.scriptPath);version(value,scene.scriptPath);if(id(value.sceneId,`${scene.scriptPath}.sceneId`)!==scene.id) fail("BROKEN_REFERENCE",`${scene.scriptPath} belongs to another scene`);const base={schemaVersion:1 as const,sceneId:scene.id,statements:objects(value.statements,`${scene.scriptPath}.statements`)};const unknown=preserved(value,["schemaVersion","sceneId","statements"]);return [scene.id,unknown?{...base,preservedFields:unknown}:base];}));
  const layouts=loadProjectLayouts(files,scenes);
  const project: CanonicalProject={mode:"editable",manifest,chapters,scenes,characters:arrayDocument(files,manifest.charactersPath,"characters") as CanonicalProject["characters"],variables:arrayDocument(files,manifest.variablesPath,"variables") as CanonicalProject["variables"],assets:arrayDocument(files,manifest.assetsPath,"assets") as CanonicalProject["assets"],localization:arrayDocument(files,manifest.localizationPath,"locales") as CanonicalProject["localization"],settings:valueDocument(files,manifest.settingsPath),ui:arrayDocument(files,manifest.uiPath,"screens") as CanonicalProject["ui"],plugins:arrayDocument(files,manifest.pluginsPath,"plugins") as CanonicalProject["plugins"],testRoutes:arrayDocument(files,manifest.testRoutesPath,"routes") as CanonicalProject["testRoutes"],scripts,layouts};
  validateEntityIds(project);validateLayouts(project); return project;
}

function validateLayouts(project:CanonicalProject):void { const groups=new Set<string>();for(const layout of Object.values(project.layouts)){for(const group of layout.groups??[]){if(groups.has(group.groupId))fail("DUPLICATE_ID",`Duplicate layout group: ${group.groupId}`);groups.add(group.groupId);}}for(const layout of Object.values(project.layouts)){for(const node of layout.nodes){if(!project.scenes.some((scene)=>scene.id===node.nodeId))fail("BROKEN_REFERENCE",`layout node references unknown scene: ${node.nodeId}`);if(node.groupId!==undefined&&!groups.has(node.groupId))fail("BROKEN_REFERENCE",`layout group references unknown group: ${node.groupId}`);}}}

function validateEntityIds(project: CanonicalProject): void { const ids=new Set<string>([project.manifest.projectId,...project.chapters.map(x=>x.id),...project.scenes.map(x=>x.id)]); const root={characters:project.characters.characters,variables:project.variables.variables,assets:project.assets.assets,locales:project.localization.locales,screens:project.ui.screens,plugins:project.plugins.plugins,routes:project.testRoutes.routes,scripts:Object.values(project.scripts).flatMap(x=>x.statements)} as JsonValue; const visit=(value:JsonValue,phase:"declare"|"reference"):void=>{if(Array.isArray(value)){value.forEach(item=>visit(item,phase));return;}if(isRecord(value)){for(const [key,item] of Object.entries(value)){if((key==="id"||key.endsWith("Id"))&&typeof item==="string")id(item,key);if(phase==="declare"&&(key==="id"||key==="textId")&&typeof item==="string"){if(ids.has(item))fail("DUPLICATE_ID",`Duplicate stable ID: ${item}`);ids.add(item);}if(phase==="reference"&&(key==="speakerId"||key==="targetSceneId")&&typeof item==="string"&&!ids.has(item))fail("BROKEN_REFERENCE",`${key} references unknown ID: ${item}`);if(isJson(item))visit(item,phase);}}}; visit(root,"declare"); visit(root,"reference"); }
function withUnknown<T extends object>(value:T & {preservedFields?:JsonObject}):JsonObject { const {preservedFields,...known}=value; return {...(preservedFields??{}),...known} as unknown as JsonObject; }
const canonical=(value:JsonValue):JsonValue=>Array.isArray(value)?value.map(canonical):isRecord(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key] as JsonValue)])):value;
const encode=(value:JsonValue)=>`${JSON.stringify(canonical(value),null,2)}\n`;
export function saveProject(project:CanonicalProject):ProjectFiles { const files:Record<string,string>={}; files[PROJECT_MANIFEST_PATH]=encode(withUnknown(project.manifest)); project.chapters.forEach((item,index)=>files[project.manifest.chapterPaths[index]??fail("BROKEN_REFERENCE","chapter path mismatch")]=encode(withUnknown(item))); const scenePaths=project.chapters.flatMap(chapter=>chapter.scenePaths); project.scenes.forEach((item,index)=>{const file=scenePaths[index]??fail("BROKEN_REFERENCE","scene path mismatch");files[file]=encode(withUnknown(item));files[item.scriptPath]=encode(withUnknown(project.scripts[item.id]??fail("BROKEN_REFERENCE",`missing script ${item.id}`)));files[item.layoutPath]=encode(withUnknown(project.layouts[item.id]??fail("BROKEN_REFERENCE",`missing layout ${item.id}`)));}); const docs:[[string,object],...Array<[string,object]>]=[[project.manifest.charactersPath,project.characters],[project.manifest.variablesPath,project.variables],[project.manifest.assetsPath,project.assets],[project.manifest.localizationPath,project.localization],[project.manifest.settingsPath,project.settings],[project.manifest.uiPath,project.ui],[project.manifest.pluginsPath,project.plugins],[project.manifest.testRoutesPath,project.testRoutes]]; docs.forEach(([file,value])=>files[file]=encode(withUnknown(value))); return Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))); }
export function semanticHashProjectFiles(files:ProjectFiles):string { return sha256(JSON.stringify(canonical(files as JsonValue))); }
export function semanticHash(project:CanonicalProject):string { return semanticHashProjectFiles(saveProject(project)); }
