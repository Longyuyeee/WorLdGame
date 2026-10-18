import { useLayoutEffect, useRef } from "react";

/** Only exported pages own this DOM. Keep offline requests/listeners alive across menus. */
export function PlayerPublicationTools({ onOpenBackup }: { onOpenBackup?: () => boolean } = {}) {
  const slot = useRef<HTMLDivElement>(null);
  const backup = useRef(onOpenBackup); backup.current = onOpenBackup;
  useLayoutEffect(() => {
    const target = slot.current;
    const doc = target?.ownerDocument;
    const home = doc?.getElementById("world-publication-home");
    const tools = home?.querySelector<HTMLElement>("#world-publication-tools");
    if (!target || !home || !tools || !doc?.getElementById("player-root")?.contains(target)) return;
    // React owns the empty slot, never the exported document's children.
    target.append(tools);
    const openBackup = (event: Event) => { if (backup.current?.()) event.preventDefault(); };
    tools.addEventListener('world-open-save-backup', openBackup);
    return () => {
      tools.removeEventListener('world-open-save-backup', openBackup);
      tools.querySelectorAll("details").forEach(panel => { panel.open = false; });
      home.append(tools);
    };
  }, []);
  return <div ref={slot} className="player-publication-tools" />;
}
