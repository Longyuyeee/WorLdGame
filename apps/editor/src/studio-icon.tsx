import type { CSSProperties } from "react";

export type StudioIconName = "story" | "assets" | "audio" | "appearance" | "checks" | "publish" | "plus" | "folder" | "import" | "sparkles" | "search" | "arrow" | "chevron" | "back" | "characters" | "variables" | "write" | "director" | "route" | "script" | "settings";
const PATHS: Record<StudioIconName, string> = {
  audio: "M9 18V5l10-2v13 M9 7l10-2 M9 18c0 3-6 3-6 0s6-3 6 0 M19 16c0 3-6 3-6 0s6-3 6 0",
  story: "M3 5h6a3 3 0 0 1 3 3v12a4 4 0 0 0-4-2H3z M21 5h-6a3 3 0 0 0-3 3v12a4 4 0 0 1 4-2h5z M6 9h3 M15 9h3 M6 12h3 M15 12h3",
  assets: "M4 4h16v16H4z M4 16l5-5 4 4 3-3 4 5 M8 8h.01",
  appearance: "M4 5h16v12H4z M8 21h8 M12 17v4 M7 8h3 M7 11h6",
  checks: "M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7z M8 12l3 3 5-6",
  publish: "M14 4c3-1 6-1 6-1s0 3-1 6l-8 8-4-4z M7 13l-3 1-1 5 6-2 M11 17l-1 4 5-1 2-5 M15 7l2 2 M4 21l3-3",
  plus: "M12 5v14 M5 12h14",
  folder: "M3 7V5h6l2 2h10v13H3z M3 11h18",
  import: "M12 3v12 M7 10l5 5 5-5 M4 15v6h16v-6",
  sparkles: "M12 3l2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z M20 2v4 M18 4h4",
  search: "M17 17l4 4 M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  arrow: "M4 12h16 M14 6l6 6-6 6",
  chevron: "M6 9l6 6 6-6",
  back: "M20 12H4 M10 6l-6 6 6 6",
  characters: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-3a7 7 0 0 1 14 0v3 M16 4a4 4 0 0 1 0 8 M19 15a6 6 0 0 1 3 6",
  variables: "M8 4H5v16h3 M16 4h3v16h-3 M10 8l4 8 M14 8l-4 8",
  write: "M4 16l-1 5 5-1L21 7l-4-4z M14 6l4 4 M4 16l4 4",
  director: "M3 8h18v13H3z M3 8l-1-4 18-3 1 4z M7 3l3 4 M14 2l3 4 M10 12l5 3-5 3z",
  route: "M5 7v6a4 4 0 0 0 4 4h8 M17 5H9a4 4 0 0 0-4 4 M14 2l3 3-3 3 M14 14l3 3-3 3 M5 3v1",
  script: "M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"
};
export function StudioIcon({ name, className = "", style }: { readonly name: StudioIconName; readonly className?: string; readonly style?: CSSProperties }) {
  return <svg className={`studio-icon ${className}`} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>;
}
