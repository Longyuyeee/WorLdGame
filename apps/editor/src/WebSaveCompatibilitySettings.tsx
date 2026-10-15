import { useMemo, useRef, useState } from "react";
import { readWebSaveCompatibility, verifyWebSaveCompatibility, withoutWebSaveCompatibility, type CanonicalProject, type JsonObject } from "@world-studio/project-domain";
import type { BlobDigest } from "@world-studio/project-persistence";
import { importPortableProjectBundle } from "./portable-project-bundle";

export function WebSaveCompatibilitySettings({ project, dirty, onChange }: {
  project: CanonicalProject; dirty: boolean; onChange: (project: CanonicalProject) => void;
}) {
  const status = useMemo(() => readWebSaveCompatibility(project), [project]);
  const currentProject = useRef(project); currentProject.current = project;
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const checkArchive = async (file: File) => {
    const captured = project;
    setBusy(true); setMessage("正在核对上一版工程和素材…");
    try {
      if (file.size > 512 * 1024 * 1024) throw new Error("工程 ZIP 超过 512 MiB，请检查文件。");
      const previous = importPortableProjectBundle(new Uint8Array(await file.arrayBuffer()));
      for (const asset of previous.project.assets.assets) {
        const source = asset.source as JsonObject | undefined;
        const bytes = typeof source?.digest === "string" ? previous.blobs.get(source.digest as BlobDigest) : undefined;
        if (!bytes || bytes.byteLength !== source?.byteLength) throw new Error("上一版素材不完整，请使用项目菜单导出的完整工程 ZIP。");
      }
      const updated = verifyWebSaveCompatibility(captured, previous.project);
      if (currentProject.current !== captured) throw new Error("当前工程已变化，请重新核对上一版。");
      onChange(updated); setMessage("核对通过。旧版存档可在新版继续；请保存工程并重新生成游戏。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "工程 ZIP 无法核对，请检查完整性。"); }
    finally { setBusy(false); }
  };
  return <details className="web-save-compatibility">
    <summary>旧版存档兼容 · {status.status === "verified" ? "已核对" : status.status === "unchecked" ? "未核对" : "需要重新核对"}</summary>
    <p>发布更新时，上传上一版完整工程 ZIP。只改版本号且内容一致时，玩家可以继续旧档；正文、分支、设置、素材或发布名称变化时，需保留原版入口。</p>
    <p>内部素材来源台账不改变剧情构建；加入玩家致谢属于公开内容修改，原核对可能失效，需要重新核对。</p>
    {status.status === "verified" && <p role="status">已核对版本：{status.versions.join("、")}。读取不会改写原槽位，继续保存仍遵循手动覆盖确认。</p>}
    {(status.status === "stale" || status.status === "invalid") && <p role="status">之前的核对已失效，本次生成不会接受这些旧档。请重新核对，或保留原版入口。</p>}
    <label>核对上一版工程 ZIP<input type="file" accept=".zip,application/zip" aria-label="核对上一版工程 ZIP" disabled={dirty || busy} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ""; if (file) void checkArchive(file);
    }} /></label>
    {dirty && <p>先应用或放弃发布设置，再核对上一版。</p>}
    {status.status !== "unchecked" && <button type="button" disabled={busy || dirty} onClick={() => { onChange(withoutWebSaveCompatibility(project)); setMessage("兼容核对已移除，请保存工程并重新生成游戏。"); }}>移除兼容核对</button>}
    {message && <p role="status">{message}</p>}
  </details>;
}
