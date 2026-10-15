import { semanticHash, readWebSaveCompatibility, type CanonicalProject } from "@world-studio/project-domain";
import { createBlobDigest, type BlobDigest } from "@world-studio/project-persistence";
import { zip } from "fflate";
import { readWebCredits, hasWebCredits, formatWebCredits, withoutWebAuthoringMetadata } from '@world-studio/project-domain';
import { addWebOfflineFiles } from "./web-offline-export";
import previewServer from "./export-preview-server.mjs?raw";
import deploymentCheck from './export-deployment-check.mjs?raw';
import { readWebPublication, publicationIconSize } from "./web-publication";
import { inspectWebReleaseSources, assertWebReleaseReady } from "./web-release-readiness";
import { optimizeExportMedia, type ExportOptimizationReport } from "./export-optimization";
import type { AtlasExportReader } from "./atlas-export";
import type { NativeAtlasVerifier } from "./native-atlas-export";

export interface FormalWebArtifact {
  readonly optimizationReport: ExportOptimizationReport;
  readonly filename: string;
  readonly html: string;
  readonly byteLength: number;
  readonly projectDigest: string;
}

function htmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function readExportMedia(
  project: CanonicalProject,
  reader: { read(digest: BlobDigest): Promise<Uint8Array | null> } & AtlasExportReader,
  signal?: AbortSignal, verify?: NativeAtlasVerifier
) {
  const inspection = await inspectWebReleaseSources(project, reader, signal);
  assertWebReleaseReady(inspection.findings);
  return optimizeExportMedia(project, inspection.assets, undefined, reader, signal, verify);
}

function exportStem(project: CanonicalProject): string {
  return project.manifest.title.normalize("NFKC").replace(/[^\p{Letter}\p{Number}_-]+/gu, "-") || "world-game";
}

export async function createFormalWebArtifact(
  project: CanonicalProject,
  reader: { read(digest: BlobDigest): Promise<Uint8Array | null> } & AtlasExportReader,
  runtime: { readonly javascript: string; readonly css: string }, signal?: AbortSignal, verify?: NativeAtlasVerifier
): Promise<FormalWebArtifact> {
  const publication = readWebPublication(project);
  project = withoutWebAuthoringMetadata({ ...project, manifest: { ...project.manifest, title: publication.name } });
  const delivery = await readExportMedia(project, reader, signal, verify);
  signal?.throwIfAborted();
  const mediaAssets = delivery.assets.map(({ bytes, digest: _digest, ...asset }) => {
    if (delivery.nativeAssetIds.has(asset.assetId)) return { ...asset, url: "" };
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return { ...asset, url: `data:${asset.mimeType};base64,${btoa(binary)}` };
  });
  const payload = JSON.stringify({ project, mediaAssets, nativeAtlasGroups: delivery.nativeAtlasGroups, optimizationReport: delivery.report }).replaceAll("<", "\\u003c").replaceAll("&", "\\u0026");
  const title = htmlText(project.manifest.title);
  const icon = mediaAssets.find(asset => asset.assetId === publication.iconAssetId);
  if (icon) publicationIconSize(Uint8Array.from(atob(icon.url.split(',')[1]!), value => value.charCodeAt(0)));
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${runtime.css.replace(/<\/style/gi, "<\\/style")}</style></head><body><div id="player-root">正在打开游戏…</div><script id="world-project" type="application/json">${payload}</script><script>${runtime.javascript.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
  const stem = exportStem(project);
  const brandedHtml = html.replace('</head>', `${icon ? `<link rel="icon" type="image/png" href="${icon.url}">` : ""}<meta name="application-version" content="${htmlText(publication.version)}"></head>`).replace('<body>', `<body style="--player-viewport-offset:24px"><p style="margin:0;height:24px;padding:4px 12px;background:#181827;color:#eee;font:12px/16px system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title} · ${htmlText(publication.version)}</p>`);
  return { filename: `${stem}.html`, html: brandedHtml, byteLength: new TextEncoder().encode(brandedHtml).byteLength, projectDigest: semanticHash(project), optimizationReport: delivery.report };
}

export async function createFormalWebDirectoryArtifact(
  project: CanonicalProject,
  reader: { read(digest: BlobDigest): Promise<Uint8Array | null> } & AtlasExportReader,
  runtime: { readonly javascript: string; readonly css: string }, signal?: AbortSignal, verify?: NativeAtlasVerifier
) {
  const publication = readWebPublication(project);
  project = withoutWebAuthoringMetadata({ ...project, manifest: { ...project.manifest, title: publication.name } });
  const encode = (text: string) => new TextEncoder().encode(text);
  const files: Record<string, Uint8Array> = {};
  const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3", "audio/ogg": "ogg", "video/mp4": "mp4", "video/webm": "webm", "font/woff2": "woff2", "font/woff": "woff", "font/ttf": "ttf", "font/otf": "otf" };
  const delivery = await readExportMedia(project, reader, signal, verify);
  signal?.throwIfAborted();
  const assets = delivery.assets;
  files["optimization-report.json"] = encode(JSON.stringify(delivery.report, null, 2));
  const mediaAssets = assets.map(({ bytes, digest, ...asset }) => {
    if (delivery.nativeAssetIds.has(asset.assetId)) return { ...asset, url: "" };
    const url = `media/${digest.slice(7)}.${extensions[asset.mimeType] ?? "bin"}`;
    files[url] = bytes;
    return { ...asset, url };
  });
  const payload = JSON.stringify({ project, mediaAssets, nativeAtlasGroups: delivery.nativeAtlasGroups }).replaceAll("<", "\\u003c").replaceAll("&", "\\u0026");
  files["index.html"] = encode(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlText(project.manifest.title)}</title><link rel="stylesheet" href="player.css"></head><body><div id="player-root">正在打开游戏…如果一直停留在这里，请先解压整个 ZIP，再打开 index.html，并确认 player.js 与它在同一文件夹。</div><script id="world-project" type="application/json">${payload}</script><script src="player.js"></script></body></html>`);
  files["player.js"] = encode(runtime.javascript);
  files["player.css"] = encode(runtime.css);
  const credits = readWebCredits(project);
  if (hasWebCredits(credits)) files['credits.txt'] = encode(formatWebCredits(credits, publication.name));
  const saveCompatibility = readWebSaveCompatibility(project);
  files["save-compatibility.json"] = encode(JSON.stringify({ schemaVersion: 1, status: saveCompatibility.status,
    verifiedVersions: saveCompatibility.versions, scope: "publication-version-only", contentChangesSupported: false }, null, 2));
  const icon = assets.find(asset => asset.assetId === publication.iconAssetId);
  const iconInfo = icon ? { path: mediaAssets.find(asset => asset.assetId === icon.assetId)!.url, size: publicationIconSize(icon.bytes) } : undefined;
  addWebOfflineFiles(files, project.manifest.title, publication.version, iconInfo);
  const projectDigest = semanticHash(project);
  files["build-info.json"] = encode(JSON.stringify({ schemaVersion: 1, format: "world-web-directory", projectTitle: project.manifest.title, publication, projectId: project.manifest.projectId, projectDigest, entry: "index.html", files: Object.entries(files).map(([path, bytes]) => ({ path, byteLength: bytes.byteLength, digest: createBlobDigest(bytes) })) }, null, 2));
  files["preview.mjs"] = encode(previewServer);
  files['deployment-check.mjs'] = encode(deploymentCheck);
  files['check-deployment.cmd'] = encode('@echo off\r\nchcp 65001 >nul\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n  echo 请先安装 Node.js 22 或更高版本：https://nodejs.org/\r\n  pause\r\n  exit /b 1\r\n)\r\nnode "%~dp0deployment-check.mjs" --interactive\r\npause\r\n');
  files["start-preview.cmd"] = encode('@echo off\r\nchcp 65001 >nul\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n  echo 请先安装 Node.js 22 或更高版本：https://nodejs.org/\r\n  echo 安装后重新双击 start-preview.cmd，无需 npm install。\r\n  pause\r\n  exit /b 1\r\n)\r\nnode "%~dp0preview.mjs" %*\r\nif errorlevel 1 pause\r\n');
  files["使用说明.txt"] = encode(`Web 游戏目录包

本地试玩：
1. 将 ZIP 完整解压到一个新文件夹，不要直接在压缩软件中打开游戏。
2. 用 Chrome 或 Edge 打开 index.html，无需安装开发工具或联网。
3. 保持 index.html、player.js、player.css 和 media 文件夹的相对位置不变。

本地站点预览（检查网站/PWA 功能）：
电脑需已安装 Node.js 22 或更高版本，无需 npm install。Windows 双击 start-preview.cmd，自动启动本机站点并打开浏览器；其他系统在解压目录运行 node preview.mjs。缺少 Node.js 时入口会显示安装提示；普通剧情试玩仍可直接打开 index.html。
保持启动窗口打开，输入 q 后回车或按 Ctrl+C 停止。网址仅本机可访问，不能发给他人当作网站地址。默认端口 4178，被占用时自动尝试后续端口；端口改变会改变存档/离线缓存位置，需要连续使用时请关闭旧预览，保持原网址。
更新预览时先保存并关闭旧游戏窗口、停止服务，将新包完整解压到新文件夹，再启动新包。不要混合两版文件；离线页面的更新仍按下方提示处理。
preview.mjs、deployment-check.mjs 和两个 CMD 入口仅供作者本地使用，不属于离线缓存。纯网站目录会保留 build-info.json 和清单列出的游戏文件，排除这些助手及作者资料。

分享和发布：
分享整个 ZIP，不要只发送 index.html。发布网站前先双击 check-deployment.cmd，选择“生成纯网站目录”；其他系统运行 node deployment-check.mjs --prepare。它会逐份核对文件大小/摘要，再生成独立 website-ready-* 文件夹，不覆盖原目录、不上传网站。只上传该文件夹中的内容（含 build-info.json），最后上传 sw.js；不要直接上传源工程、作者交付资料或整个解压根目录。
已有网站时，双击 check-deployment.cmd 选择“只读核对已部署网站”，填写有权限核对的最终 HTTPS 目录地址；其他系统运行 node deployment-check.mjs --url=https://example.invalid/your-game/ 。该地址只是格式示例，不是已部署网址。检查器只 GET 本包列出的公开文件，逐份比对本地/远端大小与 SHA-256，发现漏传、混版、错误类型、跳转或 SPA 回退会指出具体文件。不会上传文件、登录账户或修改网站；不检查素材许可或替代实际游玩/真机/离线更新验收。报告可加 --json 输出到终端。

遇到问题：
页面停在“正在打开游戏”时检查是否完整解压；素材缺失时重新解压整个包。声音可能需要点击开始故事后才播放。
本地文件存档取决于浏览器支持，移动文件夹、换浏览器或换电脑不保证保留存档。请保留原目录和原浏览器，不要把游戏 ZIP 当作存档备份。
迁移进度：打开“存读档”→“备份”，导出当前进度或已有槽位的 .worldsave 文件；在新浏览器/设备打开同一作品后，在“备份”页选择文件、核对进度并导入到手动槽位，再点击读取继续。默认选择空槽位，覆盖旧槽位需确认。备份包含一份完整进度、历史和可用截图；个人设置和游戏素材需另行保留。文件上限 96 MiB，只接受当前或作者核对过的兼容版本，剧情变化的迁移未实现。离线也可以导出/导入；当前播放器需要安全导入支持，写入失败不会部分覆盖原槽位。
网站离线与安装：
将完整目录发布到 HTTPS 站点（开发调试可用 localhost），不要仅上传 index.html。玩家展开页面顶部“离线与安装”，主动下载离线内容；“离线内容已就绪”表示清单中的文件已缓存，不代替目标浏览器实际断网重开及画面、声音、存读档检查。首次未下载、下载失败或浏览器清理数据后不可假定能离线。媒体错误时可联网后重试媒体或下载完整游戏文件，并反馈具体浏览器/设备。
安装按钮在浏览器提供安装入口时出现，也可使用浏览器菜单“安装/添加到主屏幕”；不同浏览器支持有差异。本地 file 地址不注册离线缓存，但仍可直接玩。
检查更新后若显示“新版已下载”，当前窗口继续原版，不会强制重载剧情。关闭所有游戏窗口后重新打开会使用新版。只有作者核对过、内容完全一致的版本号更新支持继续旧档；正文、分支、设置和素材变化不支持本轮兼容，需要提供原版入口。旧存档不会被清空，读取不会改写原槽位，继续保存仍遵循槽位覆盖规则。离线缓存并非永久存储保证。
本包已核对旧版本：${saveCompatibility.status === "verified" ? saveCompatibility.versions.join("、") : "无（未核对或核对已失效）"}。范围见 save-compatibility.json；作者在发布设置上传上一版完整工程 ZIP 核对，保存工程后重新生成游戏。
站点发布请完整替换目录，最后发布 sw.js；不要将缺失文件返回为 index.html，建议 sw.js 使用 Cache-Control: no-cache。部分文件未上传完整时离线更新会失败，原版缓存保留，补齐文件后重试。

素材导出策略：${delivery.report.mode === "native-atlas" ? "原生 Atlas Canvas 图块绘制，包含离线原图回退包" : delivery.report.mode === "atlas-compatible" ? "Atlas 兼容普通纹理（不是原生图集渲染）" : delivery.report.mode === "lossless-png" ? "安全 PNG 无损重压缩，不适用或无收益时保留原文件" : "原始文件"}。optimization-report.json 记录素材/共享组成本与回退原因。源工程原素材不修改；恢复原素材导出后重新构建即可恢复。普通媒体使用目录文件；原生 Atlas 组内嵌于 index.html，成本已包含 Base64。打包与播放仍需要浏览器内存，不保证 GPU 内存收益。build-info.json 记录工程标识、文件大小与摘要。
`);
  const archive = await new Promise<Uint8Array>((resolve, reject) => {
    const abort = () => { terminate(); reject(new DOMException("游戏构建已取消", "AbortError")); };
    const terminate = zip(files, { level: 0 }, (error, data) => { signal?.removeEventListener("abort", abort); error ? reject(error) : resolve(data); });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
  signal?.throwIfAborted();
  return { filename: `${exportStem(project)}-web.zip`, archive, byteLength: archive.byteLength, projectDigest, optimizationReport: delivery.report };
}
