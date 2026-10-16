import { type CanonicalProject, type WebPlayerNineSlice, type WebPlayerSkinTemplate } from "@world-studio/project-domain";
import { ImageSelect } from "./PlayerSkinImageSettings";

function Range({ label, value, min = 0, max, onChange }: { label: string; value: number; min?: number; max: number; onChange: (value: number) => void }) {
  return <label className="skin-range"><span>{label}<span aria-hidden="true" className="skin-range-value">{value}px</span></span><input aria-label={label} type="range" min={min} max={max} step={1} value={value} onChange={event => onChange(Number(event.target.value))} /></label>;
}
function Frame({ label, value, onChange }: { label: string; value: WebPlayerNineSlice; onChange: (value: WebPlayerNineSlice) => void }) {
  return <details className="skin-page-images"><summary>{label}九宫格</summary>
    <label className="skin-template-checkbox"><input type="checkbox" aria-label={`启用${label}九宫格`} checked={value.enabled} onChange={event => onChange({ ...value, enabled: event.target.checked })} />启用{label}九宫格</label>
    <small>按原图像素设置上、右、下、左切边，边角保持尺寸，中间区域拉伸。四边之和不能吃掉原图中间；按钮四状态共用切边。圆角请绘在图片内，九宫格不再额外裁切边角。</small>
    {([['top', '上'], ['right', '右'], ['bottom', '下'], ['left', '左']] as const).map(([key, name]) => <Range key={key} label={`${label}${name}切边`} value={value[key]} max={64} onChange={number => onChange({ ...value, [key]: number })} />)}
  </details>;
}
export function PlayerSkinTemplateSettings({ project, value, mode, onChange, windowAssetId = "", onWindowAssetChange }: { project: CanonicalProject; value: WebPlayerSkinTemplate; mode: "buttons" | "reading"; onChange: (value: WebPlayerSkinTemplate) => void; windowAssetId?: string; onWindowAssetChange?: (id: string) => void }) {
  const frame = (key: keyof WebPlayerSkinTemplate["frames"], label: string) => <Frame label={label} value={value.frames[key]} onChange={next => onChange({ ...value, frames: { ...value.frames, [key]: next } })} />;
  if (mode === "buttons") return frame("buttons", "按钮");
  const characters = project.characters.characters.filter(row => typeof row.id === "string" && typeof row.displayName === "string"), portrait = value.portrait;
  return <><ImageSelect project={project} label="窗体九宫格图片" value={windowAssetId} onChange={id => onWindowAssetChange?.(id)} />{frame("window", "对白窗体")}<section className="skin-page-images" aria-label="姓名框与角色头像模板"><h4>姓名框与角色头像</h4>
    <label>姓名框样式<select aria-label="姓名框样式" value={value.name.mode} onChange={event => onChange({ ...value, name: { ...value.name, mode: event.target.value as "inline" | "badge" } })}><option value="inline">行内姓名</option><option value="badge">独立姓名框</option></select></label>
    <label>姓名框对齐<select aria-label="姓名框对齐" value={value.name.align} onChange={event => onChange({ ...value, name: { ...value.name, align: event.target.value as "left" | "right" } })}><option value="left">左侧</option><option value="right">右侧</option></select></label>
    <ImageSelect project={project} label="姓名框图片" value={value.name.backgroundAssetId} onChange={backgroundAssetId => onChange({ ...value, name: { ...value.name, backgroundAssetId } })} />
    <Range label="姓名框内边距" value={value.name.padding} max={24} onChange={padding => onChange({ ...value, name: { ...value.name, padding } })} />
    <Range label="姓名框圆角" value={value.name.radius} max={32} onChange={radius => onChange({ ...value, name: { ...value.name, radius } })} />
    {frame("name", "姓名框")}
    <label className="skin-template-checkbox"><input aria-label="显示角色头像" type="checkbox" checked={portrait.enabled} onChange={event => onChange({ ...value, portrait: { ...portrait, enabled: event.target.checked } })} />显示角色头像</label>
    <label>头像位置<select aria-label="头像位置" value={portrait.side} onChange={event => onChange({ ...value, portrait: { ...portrait, side: event.target.value as "left" | "right" } })}><option value="left">姓名左侧</option><option value="right">姓名右侧</option></select></label>
    <label>头像图片适配<select aria-label="头像图片适配" value={portrait.fit} onChange={event => onChange({ ...value, portrait: { ...portrait, fit: event.target.value as "cover" | "contain" } })}><option value="cover">填满头像框</option><option value="contain">完整显示</option></select></label>
    <Range label="头像尺寸" value={portrait.size} min={32} max={144} onChange={size => onChange({ ...value, portrait: { ...portrait, size } })} />
    <Range label="头像圆角" value={portrait.radius} max={72} onChange={radius => onChange({ ...value, portrait: { ...portrait, radius } })} />
    {!characters.length && <p>先在故事中建立角色，再为说话角色选择头像。旁白不显示姓名框和头像。</p>}
    {characters.map(character => { const id = String(character.id), current = portrait.bindings.find(row => row.characterId === id); return <ImageSelect key={id} project={project} label={`角色头像：${String(character.displayName)}`} value={current?.assetId ?? ""} disabled={!current && portrait.bindings.length >= 8} onChange={assetId => onChange({ ...value, portrait: { ...portrait, bindings: [...portrait.bindings.filter(row => row.characterId !== id), ...(assetId ? [{ characterId: id, characterName: String(character.displayName).slice(0, 80), assetId }] : [])] } })} />; })}
    {portrait.bindings.filter(row => !characters.some(character => character.id === row.characterId)).map(row => <div key={row.characterId}><label>对应来源角色 {row.characterName}<select aria-label={`修复头像角色：${row.characterName}`} value="" onChange={event => { const character = characters.find(item => item.id === event.target.value); if (character) onChange({ ...value, portrait: { ...portrait, bindings: portrait.bindings.map(item => item === row ? { ...row, characterId: String(character.id), characterName: String(character.displayName).slice(0, 80) } : item) } }); }}><option value="">请选择当前作品角色</option>{characters.filter(character => !portrait.bindings.some(item => item.characterId === character.id)).map(character => <option key={String(character.id)} value={String(character.id)}>{String(character.displayName)}</option>)}</select></label><button type="button" onClick={() => onChange({ ...value, portrait: { ...portrait, bindings: portrait.bindings.filter(item => item !== row) } })}>移除来源角色头像：{row.characterName}</button></div>)}
    <small>最多八个角色头像；只按实际说话角色显示，不猜测立绘。旁白和没有绑定的角色不显示头像，图片加载失败时用姓名首字回退。跨工程需要明确对应目标角色，不复制源角色。</small>
  </section></>;
}
