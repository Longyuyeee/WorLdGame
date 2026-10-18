import { importStudioProjectArchive } from './web-delivery-bundle';
import { MAX_PROJECT_ARCHIVE_BYTES, type ProjectArchiveImportOptions, type ImportedStudioArchive } from './project-archive-import-protocol';
import { isProjectImportGuidanceCode, ProjectImportSelectionError } from './project-import-guidance';
const SMALL_FALLBACK_BYTES = 2 * 1024 * 1024;
let serial = 0;
const cancelled = () => new DOMException('已取消工程导入，尚未开始写入。', 'AbortError');
const unavailable = (detail: string) => new Error(`工程后台校验无法完成：${detail}。原项目未更改，请刷新后重试。`);
function invalidArchive(detail: string, code?: string): Error {
  if (isProjectImportGuidanceCode(code)) return new ProjectImportSelectionError(code);
  const recovery = code === 'UNSAFE_PATH' ? '工程包包含不安全的文件路径，已停止导入。请从可信来源重新导出。'
    : code === 'SIZE_LIMIT' ? '工程文件数量或展开后大小超过导入上限，请拆分后重试。'
    : code === 'UNSUPPORTED_COMPRESSION' ? '这个 ZIP 使用了暂不支持的压缩方式，请选择编辑器导出的工程 ZIP 或制作交付包。'
    : code === 'CORRUPT_BLOB' || code === 'DIGEST_MISMATCH' ? '工程素材缺失、损坏或与清单不一致，请从原项目重新导出完整工程包。'
    : code === 'INVALID_ARCHIVE' ? '工程 ZIP 不完整或已损坏，请重新下载或重新导出后重试。'
    : '工程包未通过校验，请核对所选文件，并从原项目重新导出后重试。';
  return new Error(`${recovery}\n详细信息：${detail}`);
}

export async function importProjectArchiveInWorker(file: Blob, { signal, onProgress }: ProjectArchiveImportOptions = {}, timeoutMs = 90_000): Promise<ImportedStudioArchive> {
  if (signal?.aborted) throw cancelled();
  if (file.size > MAX_PROJECT_ARCHIVE_BYTES) throw Error('工程 ZIP 超过 520 MB 的读取上限，请拆分游戏与源工程后重试。');
  onProgress?.('reading');
  if (signal?.aborted) throw cancelled();
  if (typeof Worker === 'undefined') {
    if (file.size > SMALL_FALLBACK_BYTES) throw unavailable('当前环境不支持 Web Worker，大工程不能在界面线程中校验');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (signal?.aborted) throw cancelled();
    onProgress?.('checking');
    if (signal?.aborted) throw cancelled();
    try { return importStudioProjectArchive(bytes); }
    catch (error) { const detail = error as { code?: string; message?: string }; throw invalidArchive(detail.message ?? String(error), detail.code); }
  }
  let worker: Worker;
  try { worker = new Worker(new URL('./project-archive-import.worker.ts', import.meta.url), { type: 'module', name: 'world-studio-project-import' }); }
  catch { throw unavailable('后台线程启动失败'); }
  const id = ++serial;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate(); action();
    };
    const abort = () => finish(() => reject(cancelled()));
    const timer = setTimeout(() => finish(() => reject(unavailable('校验超时'))), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    worker.addEventListener('error', event => { event.preventDefault(); finish(() => reject(unavailable('后台线程运行失败'))); }, { once: true });
    worker.addEventListener('messageerror', () => finish(() => reject(unavailable('后台结果传输失败'))), { once: true });
    worker.addEventListener('message', (event: MessageEvent) => {
      if (settled || event.data?.id !== id) return;
      if (event.data.phase === 'checking') { onProgress?.('checking'); return; }
      if (event.data.ok === true && event.data.result?.project?.manifest?.projectId && event.data.result.blobs instanceof Map) {
        finish(() => resolve(event.data.result as ImportedStudioArchive)); return;
      }
      finish(() => reject(event.data.ok === false && typeof event.data.error === 'string' ? invalidArchive(event.data.error, event.data.code) : unavailable('收到无效校验结果')));
    });
    if (signal?.aborted) { abort(); return; }
    try { worker.postMessage({ id, file }); }
    catch { finish(() => reject(unavailable('无法读取所选文件'))); }
  });
}
