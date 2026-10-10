import { compileProject } from "@world-studio/project-compiler";
import { semanticHash, type CanonicalProject, type JsonObject } from "@world-studio/project-domain";
import { createBlobDigest, type BlobDigest } from "@world-studio/project-persistence";

export interface FormalWebArtifact {
  readonly filename: string;
  readonly html: string;
  readonly byteLength: number;
  readonly projectDigest: string;
}

function htmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export async function createFormalWebArtifact(
  project: CanonicalProject,
  reader: { read(digest: BlobDigest): Promise<Uint8Array | null> },
  runtime: { readonly javascript: string; readonly css: string }
): Promise<FormalWebArtifact> {
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
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    mediaAssets.push({ assetId, displayName: name, mimeType: source.mimeType, url: `data:${source.mimeType};base64,${btoa(binary)}` });
  }
  const payload = JSON.stringify({ project, mediaAssets }).replaceAll("<", "\\u003c").replaceAll("&", "\\u0026");
  const title = htmlText(project.manifest.title);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${runtime.css.replace(/<\/style/gi, "<\\/style")}</style></head><body><div id="player-root">正在打开游戏…</div><script id="world-project" type="application/json">${payload}</script><script>${runtime.javascript.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
  const stem = project.manifest.title.normalize("NFKC").replace(/[^\p{Letter}\p{Number}_-]+/gu, "-") || "world-game";
  return { filename: `${stem}.html`, html, byteLength: new TextEncoder().encode(html).byteLength, projectDigest: semanticHash(project) };
}
