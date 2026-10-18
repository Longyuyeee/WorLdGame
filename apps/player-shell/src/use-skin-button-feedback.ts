import { useEffect, type RefObject } from "react";

/** Decorative feedback only. Never prevent a click, capture a pointer, or change game state. */
export function useSkinButtonFeedback(root: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const element = root.current;
    if (!enabled || !element) return;
    let pressed: HTMLButtonElement | null = null, pointerId: number | null = null, x = 0, y = 0;
    const clear = () => { pressed?.removeAttribute("data-skin-pressed"); pressed = null; pointerId = null; };
    const button = (target: EventTarget | null) => {
      const candidate = target instanceof Element ? target.closest("button") : null;
      return candidate instanceof HTMLButtonElement && element.contains(candidate) && !candidate.matches(":disabled,.player-dialogue") && !candidate.closest(".player-history-list") && !candidate.querySelector("img,canvas,video") ? candidate : null;
    };
    const down = (event: PointerEvent) => {
      clear(); if (event.button !== 0) return;
      pressed = button(event.target); pointerId = event.pointerId; x = event.clientX; y = event.clientY;
      pressed?.setAttribute("data-skin-pressed", "true");
    };
    const move = (event: PointerEvent) => { if (event.pointerId === pointerId && Math.hypot(event.clientX - x, event.clientY - y) > 10) clear(); };
    const out = (event: PointerEvent) => { if (pressed && event.target instanceof Node && pressed.contains(event.target) && !(event.relatedTarget instanceof Node && pressed.contains(event.relatedTarget))) clear(); };
    const key = (event: KeyboardEvent) => { if (event.key !== " " && event.key !== "Enter" || event.ctrlKey || event.altKey || event.metaKey) return; clear(); pressed = button(event.target); pressed?.setAttribute("data-skin-pressed", "true"); };
    element.addEventListener("pointerdown", down, true); element.addEventListener("pointermove", move, { passive: true }); element.addEventListener("pointerout", out);
    element.addEventListener("keydown", key, true); element.addEventListener("focusout", clear); element.addEventListener("scroll", clear, true);
    window.addEventListener("pointerup", clear, true); window.addEventListener("pointercancel", clear, true); window.addEventListener("keyup", clear, true); window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      clear(); element.removeEventListener("pointerdown", down, true); element.removeEventListener("pointermove", move); element.removeEventListener("pointerout", out);
      element.removeEventListener("keydown", key, true); element.removeEventListener("focusout", clear); element.removeEventListener("scroll", clear, true);
      window.removeEventListener("pointerup", clear, true); window.removeEventListener("pointercancel", clear, true); window.removeEventListener("keyup", clear, true); window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, [root, enabled]);
}
