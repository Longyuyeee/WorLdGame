import { WEB_PLAYER_BUTTON_STATE_LABELS, WEB_PLAYER_SKIN_SURFACE_LABELS, webPlayerCoverAssets, type CanonicalProject, type WebPlayerSkinBackground, type WebPlayerSkinImages, type WebPlayerSkinSurface } from "@world-studio/project-domain";
import "./styles/player-skin-images.css";

function ImageSelect({ project, label, value, onChange }: { project: CanonicalProject; label: string; value: string; onChange: (value: string) => void }) {
  const assets = webPlayerCoverAssets(project);
  return <label>{label}<select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
    <option value="">不使用图片，沿用默认样式</option>
    {value && !assets.some(row => (row.assetId ?? row.id) === value) && <option value={value}>图片缺失，请重新选择</option>}
    {assets.map(row => <option key={String(row.assetId ?? row.id)} value={String(row.assetId ?? row.id)}>{String(row.displayName ?? row.assetId)}</option>)}
  </select></label>;
}
export function PlayerSkinBackgroundSettings({ project, images, surface, onChange, onOpenAssets }: {
  project: CanonicalProject; images: WebPlayerSkinImages; surface: WebPlayerSkinSurface; onChange: (images: WebPlayerSkinImages) => void; onOpenAssets?: (() => void) | undefined;
}) {
  const background = images.backgrounds[surface];
  const edit = (patch: Partial<WebPlayerSkinBackground>) => onChange({ ...images, backgrounds: { ...images.backgrounds, [surface]: { ...background, ...patch } } });
  return <section className="skin-page-images" aria-label={`${WEB_PLAYER_SKIN_SURFACE_LABELS[surface]}背景素材`}>
    <h4>{WEB_PLAYER_SKIN_SURFACE_LABELS[surface]} · 独立背景</h4>
    <ImageSelect project={project} label="本页背景图片" value={background.assetId} onChange={assetId => edit({ assetId })} />
    <label>背景图片适配<select aria-label="背景图片适配" value={background.fit} onChange={event => edit({ fit: event.target.value as "cover" | "contain" })}><option value="cover">铺满，允许裁切</option><option value="contain">完整显示，允许留边</option></select></label>
    <label className="skin-range"><span>背景图片不透明度<span aria-hidden="true" className="skin-range-value">{background.opacity}%</span></span><input aria-label="背景图片不透明度" type="range" min={0} max={100} step={1} value={background.opacity} onChange={event => edit({ opacity: Number(event.target.value) })} /></label>
    <small>{surface === "reading" ? "只作为阅读舞台底图，不覆盖剧情中的场景背景；按钮和对白框仍在前方。" : surface === "title" ? "独立于标题封面；不选择则沿用原封面，缺图时仍保留底色和操作入口。" : "只改变当前页的窗体背景，不会把其他页面的背景一并替换。"} 降低不透明度可让窗体底色衬住文字；高对比阅读会隐藏装饰图片。</small>
    <button type="button" disabled={!onOpenAssets} onClick={onOpenAssets}>导入背景与按钮素材</button>
    <button type="button" disabled={!background.assetId} onClick={() => edit({ assetId: "" })}>移除本页背景图片</button>
  </section>;
}
export function PlayerSkinButtonSettings({ project, images, onChange, onOpenAssets, textColor, onTextColorChange }: {
  project: CanonicalProject; images: WebPlayerSkinImages; onChange: (images: WebPlayerSkinImages) => void; onOpenAssets?: (() => void) | undefined; textColor: string; onTextColorChange: (value: string) => void;
}) {
  return <section className="skin-page-images" aria-label="全局按钮状态素材"><h4>让按钮回应操作</h4>
    <p>图片用于文字按钮的底图，不替换文字、操作或画廊缩略图。四种状态可分别选择。</p>
    {Object.entries(WEB_PLAYER_BUTTON_STATE_LABELS).map(([state, label]) => <ImageSelect key={state} project={project} label={label} value={images.buttons[state as keyof typeof images.buttons]} onChange={assetId => onChange({ ...images, buttons: { ...images.buttons, [state]: assetId } })} />)}
    <label>图片按钮文字颜色<input aria-label="图片按钮文字颜色" type="color" value={textColor} onChange={event => onTextColorChange(event.target.value)} /></label>
    <small>与“主按钮文字”共用颜色，启用按钮图片后用于所有文字按钮。请分别检查四种底图上的文字是否清楚。</small>
    <small>未选择的状态沿用普通按钮图片；普通图片也未选时沿用默认样式。键盘焦点使用悬停图并保留焦点边框，手机使用按下图，不依赖悬停。请选用可拉伸的底图并核对文字对比度；九宫格尚未提供。</small>
    <button type="button" disabled={!onOpenAssets} onClick={onOpenAssets}>导入背景与按钮素材</button>
  </section>;
}
