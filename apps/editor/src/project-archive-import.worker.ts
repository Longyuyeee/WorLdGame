import { importStudioProjectArchive } from './web-delivery-bundle';
import { MAX_PROJECT_ARCHIVE_BYTES } from './project-archive-import-protocol';

const scope = self as unknown as { addEventListener(type: 'message', callback: (event: MessageEvent<{ id: number; file: Blob }>) => void): void; postMessage(message: unknown, transfer?: Transferable[]): void };
scope.addEventListener('message', event => {
  void (async () => {
    const { id, file } = event.data;
    try {
      if (!(file instanceof Blob) || file.size > MAX_PROJECT_ARCHIVE_BYTES) throw Error('工程 ZIP 超过读取上限或文件无效');
      const bytes = new Uint8Array(await file.arrayBuffer()); scope.postMessage({ id, phase: 'checking' });
      // This is the same bounded CRC, path, schema and SHA validation used by
      // portable and production-delivery imports. No IndexedDB writes here.
      const result = importStudioProjectArchive(bytes);
      const transfer = [...new Set([...result.blobs.values()].map(b => b.buffer as ArrayBuffer))];
      scope.postMessage({ id, ok: true, result }, transfer);
    } catch (error) { scope.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error), code: (error as { code?: string })?.code }); }
  })();
});
