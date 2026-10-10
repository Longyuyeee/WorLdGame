import { compileProject } from "@world-studio/project-compiler";
import { semanticHash, type CanonicalProject, type JsonObject } from "@world-studio/project-domain";
import { createBlobDigest, type BlobDigest } from "@world-studio/project-persistence";
import { zip } from "fflate";
import { addWebOfflineFiles } from "./web-offline-export";

export interface FormalWebArtifact {
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
  reader: { read(digest: BlobDigest): Promise<Uint8Array | null> }
) {
  const compilation = compileProject(project, "release");
  if (!compilation.ok) throw new Error(`请先修复工程问题：${compilation.diagnostics.filter((item) => item.severity === "error").map((item) => item.message).join("；")}`);
  const mediaAssets = [];
  for (const asset of project.assets.assets) {
    const assetId = String(asset.assetId ?? asset.id);
    const source = asset.source as JsonObject | undefined;
    const name = String(asset.displayName ?? assetId);
    if (typeof source?.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(source.digest) || typeof source.mimeType !== "string") {
      throw new Error(`资源“${name}”没有可导出的源文件，请重新导入后重试。`);
    }
    const bytes = await reader.read(source.digest as BlobDigest);
    if (bytes === null || createBlobDigest(bytes) !== source.digest || bytes.byteLength !== source.byteLength) {
      throw new Error(`资源“${name}”缺失或不完整，请重新导入后重试。`);
    }
    mediaAssets.push({ assetId, displayName: name, mimeType: source.mimeType, digest: source.digest, bytes });
  }
  return mediaAssets;
}

function exportStem(project: CanonicalProject): string {
  return project.manifest.title.normalize("NFKC").replace(/[^\p{Letter}\p{Number}_-]+/gu, "-") || "world-game";
}

export async function createFormalWebArtifact(
  project: CanonicalProject,
  reader: { read(digest: BlobDigest): Promise<Uint8Array | null> },
  runtime: { readonly javascript: string; readonly css: string }
): Promise<FormalWebArtifact> {
  const mediaAssets = (await readExportMedia(project, reader)).map(({ bytes, digest: _digest, ...asset }) => {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return { ...asset, url: `data:${asset.mimeType};base64,${btoa(binary)}` };
  });
  const payload = JSON.stringify({ project, mediaAssets }).replaceAll("<", "\\u003c").replaceAll("&", "\\u0026");
  const title = htmlText(project.manifest.title);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${runtime.css.replace(/<\/style/gi, "<\\/style")}</style></head><body><div id="player-root">正在打开游戏…</div><script id="world-project" type="application/json">${payload}</script><script>${runtime.javascript.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
  const stem = exportStem(project);
  return { filename: `${stem}.html`, html, byteLength: new TextEncoder().encode(html).byteLength, projectDigest: semanticHash(project) };
}

export async function createFormalWebDirectoryArtifact(
  project: CanonicalProject,
  reader: { read(digest: BlobDigest): Promise<Uint8Array | null> },
  runtime: { readonly javascript: string; readonly css: string }
) {
  const encode = (text: string) => new TextEncoder().encode(text);
  const files: Record<string, Uint8Array> = {};
  const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3", "audio/ogg": "ogg", "video/mp4": "mp4", "video/webm": "webm", "font/woff2": "woff2", "font/woff": "woff", "font/ttf": "ttf", "font/otf": "otf" };
  const assets = await readExportMedia(project, reader);
  const mediaAssets = assets.map(({ bytes, digest, ...asset }) => {
    const url = `media/${digest.slice(7)}.${extensions[asset.mimeType] ?? "bin"}`;
    files[url] = bytes;
    return { ...asset, url };
  });
  const payload = JSON.stringify({ project, mediaAssets }).replaceAll("<", "\\u003c").replaceAll("&", "\\u0026");
  files["index.html"] = encode(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlText(project.manifest.title)}</title><link rel="stylesheet" href="player.css"></head><body><div id="player-root">正在打开游戏…如果一直停留在这里，请先解压整个 ZIP，再打开 index.html，并确认 player.js 与它在同一文件夹。</div><script id="world-project" type="application/json">${payload}</script><script src="player.js"></script></body></html>`);
  files["player.js"] = encode(runtime.javascript);
  files["player.css"] = encode(runtime.css);
  addWebOfflineFiles(files, project.manifest.title);
  const projectDigest = semanticHash(project);
  files["build-info.json"] = encode(JSON.stringify({ schemaVersion: 1, format: "world-web-directory", projectTitle: project.manifest.title, projectDigest, entry: "index.html", files: Object.entries(files).map(([path, bytes]) => ({ path, byteLength: bytes.byteLength, digest: createBlobDigest(bytes) })) }, null, 2));
  files["使用说明.txt"] = encode(`Web 游戏目录包

本地试玩：
1. 将 ZIP 完整解压到一个新文件夹，不要直接在压缩软件中打开游戏。
2. 用 Chrome 或 Edge 打开 index.html，无需安装开发工具或联网。
3. 保持 index.html、player.js、player.css 和 media 文件夹的相对位置不变。

分享和发布：
分享整个 ZIP，不要只发送 index.html。也可以将解压后的全部文件上传到静态网站，访问该目录的 index.html。

遇到问题：
页面停在“正在打开游戏”时检查是否完整解压；素材缺失时重新解压整个包。声音可能需要点击开始故事后才播放。
本地文件存档取决于浏览器支持，移动文件夹、换浏览器或换电脑不保证保留存档。请保留原目录和原浏览器，不要把游戏 ZIP 当作存档备份。
网站离线与安装：
将完整目录发布到 HTTPS 站点（开发调试可用 localhost），不要仅上传 index.html。玩家展开页面顶部“离线与安装”，主动下载离线内容；显示“离线内容已就绪”后才能保证断网重开。首次未下载、下载失败或浏览器清理数据后不可假定能离线。
安装按钮在浏览器提供安装入口时出现，也可使用浏览器菜单“安装/添加到主屏幕”；不同浏览器支持有差异。本地 file 地址不注册离线缓存，但仍可直接玩。
检查更新后若显示“新版已下载”，先保存进度，关闭所有此游戏窗口，再重新打开；不会强制重载正在玩的剧情。更新只处理游戏文件，不清空存档。离线缓存并非永久存储保证。
站点发布请完整替换目录，最后发布 sw.js；不要将缺失文件返回为 index.html，建议 sw.js 使用 Cache-Control: no-cache。部分文件未上传完整时离线更新会失败，原版缓存保留，补齐文件后重试。

素材为原始文件，未进行压缩优化；目录包避免 Base64 膨胀，但打包仍需要浏览器内存，小工程可能因附加文件而略大。build-info.json 记录工程标识、文件大小与摘要，供定位版本问题。
`);
  const archive = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 0 }, (error, data) => error ? reject(error) : resolve(data)));
  return { filename: `${exportStem(project)}-web.zip`, archive, byteLength: archive.byteLength, projectDigest };
}
