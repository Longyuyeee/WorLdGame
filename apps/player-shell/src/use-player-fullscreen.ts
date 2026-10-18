import { useEffect, useRef, useState } from 'react';

export function usePlayerFullscreen() {
  const element = useRef<HTMLElement | null>(null), mounted = useRef(false), pending = useRef(false);
  const [active, setActive] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    mounted.current = true;
    const changed = () => {
      const owned = element.current !== null && document.fullscreenElement === element.current;
      setActive(owned); setMessage(owned ? '已进入全屏，可在此退出或使用浏览器的退出操作。' : '已退出全屏，剧情位置不变。');
    };
    document.addEventListener('fullscreenchange', changed);
    return () => { mounted.current = false; document.removeEventListener('fullscreenchange', changed); };
  }, []);
  async function toggle() {
    const root = element.current;
    if (pending.current || !root?.isConnected) return;
    if (document.fullscreenElement && document.fullscreenElement !== root) { setMessage('其他画面正在全屏，请先退出后重试。'); return; }
    if (typeof root.requestFullscreen !== 'function' || typeof document.exitFullscreen !== 'function' || document.fullscreenEnabled === false) {
      setMessage('当前浏览器不支持或未允许游戏全屏，可以继续使用普通窗口。'); return;
    }
    pending.current = true; setBusy(true); setMessage('');
    try {
      if (document.fullscreenElement === root) await document.exitFullscreen(); else await root.requestFullscreen();
      if (mounted.current) { setActive(document.fullscreenElement === root); setMessage(document.fullscreenElement === root ? '已进入全屏，可在此退出或使用浏览器的退出操作。' : '已退出全屏，剧情位置不变。'); }
    } catch { if (mounted.current) setMessage('浏览器未完成全屏切换，剧情位置未改变。可检查浏览器或嵌入页面的权限后重试。'); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return { element, active, busy, message, toggle };
}
