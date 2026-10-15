import { importProjectBinaryZip, semanticHash, withoutWebAuthoringMetadata, type CanonicalProject } from "@world-studio/project-domain";
import { createBlobDigest, type AssetIndex, type BlobDigest } from "@world-studio/project-persistence";
import { exportPortableCanonicalProject, importPortableProjectBundle, importPortableProjectFiles } from "./portable-project-bundle";
import { readWebPublication } from "./web-publication";
import { readPlaytestNotes, writePlaytestNotes, type PlaytestNote } from "./playtest-notes";
import { readPlaytestProgress, writePlaytestProgress, type PlaytestCompletion } from "./playtest-progress";
import type { FormalWebArtifact } from "./formal-web-export";
import { zip } from "fflate";
import { createWebReleasePreparation, formatWebReleasePreparation } from './web-release-preparation';

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(value);
const LIMITS = { maxEntries: 8192, maxEntryBytes: 512 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024 };
export interface WebDeliveryManifest {
  readonly schemaVersion: 1; readonly kind: "world-production-delivery"; readonly projectId: string;
  readonly publication: { readonly name: string; readonly version: string }; readonly format: "html" | "directory";
  readonly sourceProjectDigest: string; readonly gameProjectDigest: string; readonly gameEntry: string;
  readonly sourceEntry: "source/project.zip"; readonly reviewEntry: "review/playtest-notes.worldreview" | null;
  readonly progressEntry?: "review/playtest-progress.worldplaytest" | null;
  readonly files: readonly { readonly path: string; readonly byteLength: number; readonly digest: string }[];
}
type GameArtifact = Pick<FormalWebArtifact, "filename" | "projectDigest"> & ({ readonly html: string } | { readonly archive: Uint8Array });

export async function createWebDeliveryBundle(project: CanonicalProject, index: AssetIndex, reader: { read(digest: BlobDigest): Promise<Uint8Array | null> }, game: GameArtifact, notes: readonly PlaytestNote[] | null, signal?: AbortSignal, onProgress?: (label: string) => void, progress: readonly PlaytestCompletion[] | null = null) {
  signal?.throwIfAborted();
  const publication = readWebPublication(project), normalized = withoutWebAuthoringMetadata({ ...project, manifest: { ...project.manifest, title: publication.name } });
  if (game.projectDigest !== semanticHash(normalized)) throw Error("游戏与当前工程不是同一次内容，请重新生成交付包。");
  const files: Record<string, Uint8Array> = {};
  const directory = "archive" in game;
  if (directory) for (const [path, bytes] of Object.entries(importProjectBinaryZip(game.archive, LIMITS))) files[`game/${path}`] = bytes;
  else files["game/index.html"] = encode(game.html);
  onProgress?.("正在收集可编辑工程和原素材…");
  files["source/project.zip"] = await exportPortableCanonicalProject(project, index, reader, signal);
  files['release/preparation.json'] = encode(JSON.stringify(createWebReleasePreparation(project), null, 2));
  files['release/准备上线.txt'] = encode(formatWebReleasePreparation(project));
  if (notes !== null) files["review/playtest-notes.worldreview"] = encode(writePlaytestNotes(project.manifest.projectId, notes));
  if (progress !== null) files["review/playtest-progress.worldplaytest"] = encode(writePlaytestProgress(project.manifest.projectId, progress));
  files["开始使用.txt"] = encode(`制作交付包\n\n作品：${publication.name}\n版本：${publication.version}\n\n本包用于作者备份、继续制作或交接。完整解压后：\n1. 游戏试玩：打开 game/index.html。${directory ? "网站部署仅使用 game 文件夹；保持里面的素材路径不变。本地站点预览见 game/使用说明.txt。" : "这是单文件游戏，可直接分享 game/index.html；网站目录需要另行导出。"}\n2. 继续制作：在 WorLd Studio 首页导入整个交付 ZIP，或导入 source/project.zip。源工程包含可编辑剧情、原素材和设置。\n3. 校订记录：${notes !== null ? "恢复工程后，可选择合并包内记录；也可在检查页导入 review/playtest-notes.worldreview。" : "本次没有附带校订记录，原浏览器中的记录仍保留。"}\n4. 试玩进度：${progress !== null ? "恢复工程后，可选择合并包内记录；也可在检查页导入 review/playtest-progress.worldplaytest。旧稿记录不会计入当前稿，不代表人工验收。" : "本次没有附带试玩进度，原浏览器中的记录仍保留。"}\n5. 交付清单：delivery.json 列出源工程、游戏和所附记录的大小及 SHA-256。\n\n给玩家的文件在 game 中。source 和 review 是作者资料，网站发布不要上传这两个文件夹。\n本包不包含玩家存档。内容来自同一次保存快照；不代表真人阅读、素材许可、真机或所有分支已经验收。游戏使用发布名称，源工程保留编辑器中的项目名称。\n`);
  files['开始使用.txt'] = encode(decode(files['开始使用.txt']!) + '\n发布准备：release/preparation.json 和 release/准备上线.txt 是同一源工程的内部清单，含逐素材来源及待办。source、release、review 均是作者资料，不要上传到玩家网站；只有明确加入“制作名单”的公开署名进入游戏。确认依据不等于工具作出授权结论；实际部署、真机和离线升级仍需按清单执行。\n');
  const rows = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => ({ path, byteLength: bytes.length, digest: createBlobDigest(bytes) }));
  if (rows.length + 1 > LIMITS.maxEntries || rows.reduce((sum, row) => sum + row.byteLength, 0) > LIMITS.maxTotalBytes - 1024 * 1024) throw Error("制作交付包超过 512 MB，请分别导出游戏和源工程。");
  const manifest: WebDeliveryManifest = { schemaVersion: 1, kind: "world-production-delivery", projectId: project.manifest.projectId, publication: { name: publication.name, version: publication.version }, format: directory ? "directory" : "html", sourceProjectDigest: semanticHash(project), gameProjectDigest: game.projectDigest, gameEntry: "game/index.html", sourceEntry: "source/project.zip", reviewEntry: notes !== null ? "review/playtest-notes.worldreview" : null, progressEntry: progress !== null ? "review/playtest-progress.worldplaytest" : null, files: rows };
  files["delivery.json"] = encode(JSON.stringify(manifest, null, 2));
  signal?.throwIfAborted(); onProgress?.("正在打包制作交付包…");
  const archive = await new Promise<Uint8Array>((resolve, reject) => {
    const abort = () => { terminate(); reject(new DOMException("交付包构建已取消", "AbortError")); };
    const terminate = zip(files, { level: 0 }, (error, data) => { signal?.removeEventListener("abort", abort); error ? reject(error) : resolve(data); });
    signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
  });
  signal?.throwIfAborted();
  const stem = publication.name.normalize("NFKC").replace(/[^\p{Letter}\p{Number}_-]+/gu, "-") || "world-game";
  return { archive, filename: `${stem}-${publication.version.replace(/[^A-Za-z0-9._-]/gu, "-")}-production.zip`, byteLength: archive.length, manifest };
}

/** No writes: validate the full delivery before restoring its author source. */
export function importStudioProjectArchive(archive: Uint8Array) {
  const files = importProjectBinaryZip(archive, LIMITS);
  if (Object.hasOwn(files, "world.project.json") || !Object.hasOwn(files, "delivery.json")) return { ...importPortableProjectFiles(files), reviewNotes: null, playtestProgress: null };
  if (files["delivery.json"]!.length > 2 * 1024 * 1024) throw Error("制作交付清单超过大小限制。");
  const raw: unknown = JSON.parse(decode(files["delivery.json"]!));
  if (!raw || typeof raw !== "object") throw Error("制作交付清单格式不正确。");
  const manifest = raw as WebDeliveryManifest;
  if (manifest.schemaVersion !== 1 || manifest.kind !== "world-production-delivery" || manifest.sourceEntry !== "source/project.zip" || manifest.gameEntry !== "game/index.html" || !["html", "directory"].includes(manifest.format) || !Array.isArray(manifest.files) || manifest.files.length > LIMITS.maxEntries || manifest.reviewEntry !== null && manifest.reviewEntry !== "review/playtest-notes.worldreview") throw Error("制作交付包版本或入口不正确。");
  if (manifest.progressEntry !== undefined && manifest.progressEntry !== null && manifest.progressEntry !== "review/playtest-progress.worldplaytest") throw Error("制作交付包试玩进度入口不正确。");
  const expected = new Set<string>(["delivery.json"]);
  for (const row of manifest.files) {
    if (!row || typeof row.path !== "string" || expected.has(row.path) || !Object.hasOwn(files, row.path)) throw Error("制作交付包文件清单不完整或重复。");
    const bytes = files[row.path]!;
    if (row.byteLength !== bytes.length || row.digest !== createBlobDigest(bytes)) throw Error(`制作交付包文件损坏：${row.path}`);
    expected.add(row.path);
  }
  if (expected.size !== Object.keys(files).length || !expected.has(manifest.gameEntry) || !expected.has(manifest.sourceEntry) || manifest.reviewEntry && !expected.has(manifest.reviewEntry) || manifest.progressEntry && !expected.has(manifest.progressEntry)) throw Error("制作交付包缺少必要文件或包含清单外文件。");
  const imported = importPortableProjectBundle(files[manifest.sourceEntry]!);
  const publication = readWebPublication(imported.project);
  if (imported.project.manifest.projectId !== manifest.projectId || semanticHash(imported.project) !== manifest.sourceProjectDigest || manifest.publication?.name !== publication.name || manifest.publication?.version !== publication.version || semanticHash(withoutWebAuthoringMetadata({ ...imported.project, manifest: { ...imported.project.manifest, title: publication.name } })) !== manifest.gameProjectDigest) throw Error("源工程与制作交付清单不匹配。");
  const reviewNotes = manifest.reviewEntry ? decode(files[manifest.reviewEntry]!) : null;
  if (reviewNotes !== null) readPlaytestNotes(reviewNotes, manifest.projectId);
  const playtestProgress = manifest.progressEntry ? decode(files[manifest.progressEntry]!) : null;
  if (playtestProgress !== null) readPlaytestProgress(playtestProgress, manifest.projectId);
  return { ...imported, reviewNotes, playtestProgress };
}
