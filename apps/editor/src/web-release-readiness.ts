import { compileProject, type CompilerDiagnostic } from "@world-studio/project-compiler";
import { applyWebPlayerAppearance, readWebPlayerAppearance, readWebCredits, type CanonicalProject, type JsonObject } from "@world-studio/project-domain";
import { createBlobDigest, type BlobDigest } from "@world-studio/project-persistence";
import { applyWebPublication, publicationIconSize, readWebPublication } from "./web-publication";

export interface WebReleaseFinding {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly title: string;
  readonly message: string;
  readonly target: "story" | "assets" | "appearance" | "publication" | "checks";
  readonly sceneId?: string;
  readonly statementId?: string;
  readonly assetId?: string;
}

const TITLES: Partial<Record<CompilerDiagnostic["code"], string>> = {
  MISSING_ENTRY_SCENE: "故事起点不存在", MISSING_SCRIPT: "场景缺少脚本",
  INVALID_STATEMENT: "这一步的内容不完整", MISSING_SPEAKER: "对白使用了不存在的角色",
  MISSING_TARGET_SCENE: "选项指向了不存在的场景", DUPLICATE_LABEL: "跳转标记重名",
  MISSING_LABEL: "跳转目标不存在", MISSING_VARIABLE: "使用了不存在的变量",
  INVALID_EXPRESSION: "条件或计算表达式有误", TYPE_MISMATCH: "变量和表达式类型不一致",
  INVALID_WAIT_DURATION: "等待时间无效", MISSING_ASSET: "演出引用的素材未登记",
  INVALID_ASSET: "演出素材类型不匹配", MISSING_CATALOG_ENTRY: "附加内容条目不存在",
  MISSING_CATALOG_COVER: "附加内容封面不存在", INVALID_CATALOG_OVERRIDE: "附加内容设置有误",
  UNREACHABLE_SCENE: "这个场景无法从入口到达", UNREACHABLE_STATEMENT: "这一步无法被走到",
  NON_INTERACTIVE_LOOP: "故事可能卡在无法退出的循环中", CROSS_SCENE_CLOSED_CYCLE: "场景连接形成了封闭循环",
  CROSS_SCENE_NO_EXIT: "场景连接缺少出口", CONSTANT_CONDITION_TRUE: "这个条件始终成立",
  CONSTANT_CONDITION_FALSE: "这个条件始终不成立", SCENE_NO_EXIT: "场景没有可达的出口或结局",
  NO_REACHABLE_ENDING: "从入口无法到达任何结局"
};

function compilerFinding(item: CompilerDiagnostic): WebReleaseFinding {
  return { severity: item.severity, code: item.code, title: TITLES[item.code] ?? "故事需要检查", message: item.message,
    target: item.sceneId === undefined ? "checks" : "story",
    ...(item.sceneId === undefined ? {} : { sceneId: item.sceneId }),
    ...(item.statementId === undefined ? {} : { statementId: item.statementId }) };
}

export class WebReleaseValidationError extends Error {
  constructor(readonly findings: readonly WebReleaseFinding[]) {
    super(`请先修复工程问题：${findings.filter(item => item.severity === "error").map(item => item.message).join("；")}`);
    this.name = "WebReleaseValidationError";
  }
}

export function assertWebReleaseReady(findings: readonly WebReleaseFinding[]): void {
  if (findings.some(item => item.severity === "error")) throw new WebReleaseValidationError(findings);
}

export interface WebReleaseSourceAsset {
  readonly assetId: string;
  readonly displayName: string;
  readonly mimeType: string;
  readonly digest: string;
  readonly bytes: Uint8Array;
}
export interface WebReleaseInspection {
  readonly findings: readonly WebReleaseFinding[];
  readonly assets: readonly WebReleaseSourceAsset[];
  readonly checkedAssetCount: number;
}

/** Check fresh storage each invocation; deduplicate shared blobs only within this invocation. */
export async function inspectWebReleaseSources(project: CanonicalProject,
  reader: { read(digest: BlobDigest): Promise<Uint8Array | null> }, signal?: AbortSignal,
  onProgress?: (checked: number, total: number) => void
): Promise<WebReleaseInspection> {
  signal?.throwIfAborted();
  const findings: WebReleaseFinding[] = [];
  const publication = readWebPublication(project);
  try { readWebCredits(project); }
  catch (error) { findings.push({ severity: 'error', code: 'WEB_CREDITS_INVALID', title: '制作名单需要修改', message: error instanceof Error ? error.message : String(error), target: 'publication' }); }
  try { applyWebPublication(project, publication); }
  catch (error) { findings.push({ severity: "error", code: "WEB_PUBLICATION_INVALID", title: "作品信息需要修改", message: error instanceof Error ? error.message : String(error), target: "publication" }); }
  try {
    const appearance = readWebPlayerAppearance(project);
    if (appearance !== null) applyWebPlayerAppearance(project, appearance);
  } catch (error) { findings.push({ severity: "error", code: "WEB_APPEARANCE_INVALID", title: "游戏外观设置需要修改", message: error instanceof Error ? error.message : String(error), target: "appearance" }); }
  const compilation = compileProject({ ...project, manifest: { ...project.manifest, title: publication.name } }, "release");
  findings.push(...compilation.diagnostics.map(compilerFinding));
  const assets: WebReleaseSourceAsset[] = [];
  const reads = new Map<string, { bytes: Uint8Array | null; validDigest: boolean; error?: string }>();
  let checkedAssetCount = 0;
  for (const asset of project.assets.assets) {
    signal?.throwIfAborted();
    const assetId = String(asset.assetId ?? asset.id), name = String(asset.displayName ?? assetId);
    const source = asset.source as JsonObject | undefined;
    const missing = (code: string, title: string, message: string) => findings.push({ severity: "error", code, title, message, target: "assets", assetId });
    if (typeof source?.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(source.digest) || typeof source.mimeType !== "string" || !source.mimeType || typeof source.byteLength !== "number" || !Number.isSafeInteger(source.byteLength) || source.byteLength <= 0) {
      missing("WEB_ASSET_SOURCE_INVALID", `素材“${name}”没有可导出的源文件`, `资源“${name}”没有可导出的源文件，请重新导入后重试。`);
    } else {
      let result = reads.get(source.digest);
      if (result === undefined) {
        try {
          const bytes = await reader.read(source.digest as BlobDigest);
          signal?.throwIfAborted();
          result = { bytes, validDigest: bytes !== null && createBlobDigest(bytes) === source.digest };
        } catch (error) {
          signal?.throwIfAborted();
          result = { bytes: null, validDigest: false, error: error instanceof Error ? error.message : String(error) };
        }
        reads.set(source.digest, result);
      }
      if (!result.validDigest || result.bytes === null || result.bytes.byteLength !== source.byteLength) {
        missing("WEB_ASSET_SOURCE_UNAVAILABLE", `素材“${name}”缺失或不完整`, `资源“${name}”缺失或不完整，请重新导入后重试。${result.error ? `（${result.error}）` : ""}`);
      } else {
        assets.push({ assetId, displayName: name, mimeType: source.mimeType, digest: source.digest, bytes: result.bytes });
        if (assetId === publication.iconAssetId) {
          try { publicationIconSize(result.bytes); }
          catch (error) { findings.push({ severity: "error", code: "WEB_PUBLICATION_ICON_INVALID", title: "发布图标尺寸或格式不合适", message: error instanceof Error ? error.message : String(error), target: "publication", assetId }); }
        }
      }
    }
    checkedAssetCount++;
    onProgress?.(checkedAssetCount, project.assets.assets.length);
  }
  signal?.throwIfAborted();
  return { findings, assets, checkedAssetCount };
}
