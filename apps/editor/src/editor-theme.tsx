import { useEffect, useState } from "react";

const THEMES = [{ id: "light", label: "清亮" }, { id: "dark", label: "石墨" }, { id: "paper", label: "暖纸" }, { id: "system", label: "跟随系统" }] as const;
type EditorTheme = typeof THEMES[number]["id"];
const KEY = "world-studio.editor-theme";
function storedTheme(): EditorTheme {
  try { const value = localStorage.getItem(KEY); return THEMES.some(item => item.id === value) ? value as EditorTheme : "light"; } catch { return "light"; }
}
function applyTheme(theme: EditorTheme) {
  document.documentElement.dataset.editorTheme = theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
}
export function initializeEditorTheme() {
  applyTheme(storedTheme());
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme(storedTheme()));
}
export function EditorThemeControl() {
  const [theme, setTheme] = useState(storedTheme);
  useEffect(() => { const refresh = () => setTheme(storedTheme()); window.addEventListener("editor-theme-change", refresh); return () => window.removeEventListener("editor-theme-change", refresh); }, []);
  return <fieldset className="editor-theme-control"><legend>编辑器主题</legend><p>选择适合你的创作环境。</p><div>{THEMES.map(item => <button type="button" key={item.id} aria-pressed={theme === item.id} onClick={() => {
    setTheme(item.id); try { localStorage.setItem(KEY, item.id); } catch { /* Theme remains available for this session. */ }
    applyTheme(item.id); window.dispatchEvent(new Event("editor-theme-change"));
  }}><span className={`theme-swatch theme-swatch--${item.id}`} aria-hidden="true" />{item.label}</button>)}</div></fieldset>;
}
