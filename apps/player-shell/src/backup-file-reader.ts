/** FileReader can stop an actual file read. The fallback only cancels waiting;
 * neither path may publish bytes after its owner has aborted. */
export function readPlayerBackupFile(file: File, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let reader: FileReader | undefined, settled = false;
    const finish = (action: () => void) => { if (settled) return; settled = true; signal.removeEventListener('abort', abort); if (reader) reader.onload = reader.onerror = reader.onabort = null; action(); };
    const abort = () => { finish(() => reject(signal.reason)); try { reader?.abort(); } catch { /* The read may already have retired. */ } };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    if (typeof FileReader === 'undefined') {
      try { file.arrayBuffer().then(bytes => finish(() => resolve(new Uint8Array(bytes))), () => finish(() => reject(Error('备份文件读取失败，请重新选择文件。')))); }
      catch { finish(() => reject(Error('备份文件读取失败，请重新选择文件。'))); } return;
    }
    try {
      reader = new FileReader();
      reader.onload = () => { const bytes = reader!.result; finish(() => bytes instanceof ArrayBuffer ? resolve(new Uint8Array(bytes)) : reject(Error('备份文件读取失败，请重新选择文件。'))); };
      reader.onerror = () => finish(() => reject(Error('备份文件读取失败，请重新选择文件。')));
      reader.onabort = () => finish(() => reject(new DOMException('备份读取已取消。', 'AbortError')));
      reader.readAsArrayBuffer(file);
    } catch { finish(() => reject(Error('备份文件读取失败，请重新选择文件。'))); }
  });
}
