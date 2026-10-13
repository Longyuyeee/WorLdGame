import { useEffect, useState } from "react";
import { applyWebPlayerAppearance, DEFAULT_WEB_PLAYER_APPEARANCE, readWebPlayerAppearance, webPlayerCoverAssets,
  type CanonicalProject } from "@world-studio/project-domain";

export function PlayerAppearanceSettings({ project, onChange, onDirtyChange }: {
  readonly project: CanonicalProject; readonly onChange: (project: CanonicalProject) => void; readonly onDirtyChange: (dirty: boolean) => void;
}) {
  const saved = readWebPlayerAppearance(project) ?? DEFAULT_WEB_PLAYER_APPEARANCE;
  const [draft, setDraft] = useState(saved), [message, setMessage] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { setDraft(saved); }, [saved.theme, saved.accent, saved.titleTagline, saved.coverAssetId]);
  const covers = webPlayerCoverAssets(project);
  const missing = draft.coverAssetId !== "" && !covers.some(asset => String(asset.assetId ?? asset.id) === draft.coverAssetId);
  return <section className="player-appearance-editor" aria-labelledby="player-appearance-heading">
    <header><h3 id="player-appearance-heading">玩家标题与配色</h3><p>标题、正文、选择和存档使用同一套配色。编辑器主题独立设置。</p></header>
    <div className="player-appearance-form">
      <label>玩家主题<select aria-label="玩家主题" value={draft.theme} onChange={event => setDraft({ ...draft, theme: event.target.value as typeof draft.theme })}><option value="midnight">夜幕</option><option value="paper">暖纸</option></select></label>
      <label>玩家强调色<select aria-label="玩家强调色" value={draft.accent} onChange={event => setDraft({ ...draft, accent: event.target.value as typeof draft.accent })}><option value="violet">紫罗兰</option><option value="teal">青绿</option><option value="rose">玫瑰</option></select></label>
      <label>标题简介<textarea aria-label="标题简介" maxLength={200} rows={3} value={draft.titleTagline} onChange={event => setDraft({ ...draft, titleTagline: event.target.value })} /></label>
      <label>标题封面<select aria-label="标题封面" value={draft.coverAssetId} onChange={event => setDraft({ ...draft, coverAssetId: event.target.value })}><option value="">使用默认背景</option>{missing && <option value={draft.coverAssetId}>素材已缺失，请重新选择</option>}{covers.map(asset => <option key={String(asset.assetId ?? asset.id)} value={String(asset.assetId ?? asset.id)}>{String(asset.displayName ?? asset.assetId ?? asset.id)}</option>)}</select><small>选择已通过检查、不超过 8 MB 和 400 万像素的 PNG/JPEG/WebP；封面读取失败时仍可开始游戏。</small></label>
    </div>
    {missing && <p role="alert">标题封面已缺失，请重新导入，或选择“使用默认背景”。</p>}
    <div className="player-appearance-actions"><button type="button" disabled={!dirty || missing} onClick={() => { try { onChange(applyWebPlayerAppearance(project, draft)); setMessage("玩家外观已应用。保存工程后可在导出的游戏中查看。"); } catch (error) { setMessage((error as Error).message); } }}>应用玩家外观</button><button type="button" disabled={!dirty} onClick={() => { setDraft(saved); setMessage(""); }}>放弃外观修改</button><button type="button" onClick={() => setDraft(DEFAULT_WEB_PLAYER_APPEARANCE)}>恢复默认外观</button></div>
    {message && <p role="status">{message}</p>}
  </section>;
}
