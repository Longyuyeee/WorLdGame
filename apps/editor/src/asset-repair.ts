import type { StoryProject } from "@world-studio/story-core";
import { inspectDirectiveArguments } from "@world-studio/story-language";
import { AssetBlobError, type AssetIndexEntry, type AssetBlobStore } from "@world-studio/project-persistence";
import type { IndexedDbAssetRepository } from "./indexeddb-asset-repository";

/** Typed source references, not filename guesses or a second runtime model. */
export function assetSourceUsages(project: StoryProject) {
  return project.scenes.flatMap((scene) => scene.statements.flatMap((statement) => {
    if (statement.kind !== "direction") return [];
    const inspection = inspectDirectiveArguments(statement.summary);
    return ["asset", "transitionAsset"].flatMap((parameter) => {
      const assetId = inspection.parameters[parameter];
      return !assetId || inspection.duplicateKeys.includes(parameter) ? [] : [{ assetId, sceneId: scene.id, sceneTitle: scene.title, statementId: statement.id, parameter }];
    });
  }));
}

export async function checkAssetSource(reader: Pick<AssetBlobStore, "read">, entry: AssetIndexEntry): Promise<string> {
  try {
    const bytes = await reader.read(entry.source.digest);
    if (bytes === null) return "源文件缺失：请使用改名 / 替换文件重新导入，稳定 ID 和剧情引用会保留。";
    if (bytes.byteLength !== entry.source.byteLength) return "源文件大小与索引不符：请重新导入替换文件修复。";
    return "源文件校验通过；内容可读取且与索引大小一致。";
  } catch (error) {
    return `源文件无法读取：${error instanceof Error ? error.message : "未知错误"}。请替换文件或从工程备份恢复。`;
  }
}

/** Republishes verified immutable bytes with metadata; uses the normal fenced CAS. */
export async function republishAssetEntry(repository: IndexedDbAssetRepository, entry: AssetIndexEntry, expectedIndexRevision: number, signal?: AbortSignal) {
  const bytes = await repository.read(entry.source.digest);
  if (bytes === null) throw new AssetBlobError("INVALID_ASSET", "read", entry.assetId, "源文件缺失，请选择替换文件恢复资源；原索引未修改。");
  return repository.importAsset({ assetId: entry.assetId, displayName: entry.displayName, kind: entry.kind,
    tags: entry.tags, ...(entry.preservedFields === undefined ? {} : { preservedFields: entry.preservedFields }),
    mimeType: entry.source.mimeType, bytes }, { expectedIndexRevision, maxBytes: Math.max(1, bytes.byteLength), ...(signal === undefined ? {} : { signal }) });
}
