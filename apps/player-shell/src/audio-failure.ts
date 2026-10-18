/** Policy interruptions do not clear failures. Retry or an explicit source
 * replacement creates a fresh owner; play() rejection may lack MediaError. */
export function playerAudioHasFailure(element: HTMLAudioElement): boolean {
  return !!element.error || element.dataset.playerPlayback === 'error' || element.dataset.voiceFailed === 'true';
}

/** Hints are deliberately not a codec/support verdict; the same browser may work online. */
export function playerAudioFailureHint(code: number | undefined): string {
  if (code === 2) return '声音下载失败。请检查网络；离线文件已缓存也不代表当前浏览器能播放。';
  if (code === 3) return '声音无法解码。可重试，或备份进度后换浏览器；仍失败请向作者反馈素材问题。';
  if (code === 4) return '当前浏览器无法打开这份声音。请联网重试；仍失败可备份进度后换浏览器或使用作者提供的完整目录。';
  return '声音未能播放。请重试；也可先无声阅读，之后再恢复声音。';
}
