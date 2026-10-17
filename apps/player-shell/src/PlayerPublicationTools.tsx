import { useLayoutEffect, useRef } from "react";

/** Only exported pages own this DOM. Keep offline requests/listeners alive across menus. */
export function PlayerPublicationTools() {
  const slot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const target = slot.current;
    const doc = target?.ownerDocument;
    const home = doc?.getElementById("world-publication-home");
    const tools = home?.querySelector<HTMLElement>("#world-publication-tools");
    if (!target || !home || !tools || !doc?.getElementById("player-root")?.contains(target)) return;
    // React owns the empty slot, never the exported document's children.
    target.append(tools);
    return () => {
      tools.querySelectorAll("details").forEach(panel => { panel.open = false; });
      home.append(tools);
    };
  }, []);
  return <div ref={slot} className="player-publication-tools" />;
}
