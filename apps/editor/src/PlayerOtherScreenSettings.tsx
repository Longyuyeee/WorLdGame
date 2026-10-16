import { defaultWebPlayerScreens, WEB_PLAYER_SCREEN_LABELS, type WebPlayerScreenId, type WebPlayerScreenPanel, type WebPlayerScreens } from "@world-studio/project-domain";

const descriptions: Record<WebPlayerScreenId, string> = {
  menu: "玩家暂停阅读、调整推进方式和进入其他页面的地方。",
  save: "调整存档卡片的密度与窗体；预览中的保存仅临时保留。",
  history: "保持正文可读、查找与返回入口可见。记录区会独立滚动。",
  preferences: "外观由作者设定，个人字号、音量与无障碍仍由玩家选择。",
  additional: "收藏画廊、音乐、回想和结局的统一入口。",
  credits: "为制作人员、来源署名和较长许可文字留出阅读空间。",
  ending: "调整故事结束的告别文字和返回入口。结局名称仍在剧情中编辑。"
};
const ranges = [["本页宽度", "width", 320, 1200, 20, "px"], ["本页圆角", "radius", 0, 40, 1, "px"], ["本页内边距", "padding", 12, 40, 1, "px"], ["本页不透明度", "opacity", 55, 100, 1, "%"], ["本页文字大小", "fontSize", 12, 24, 1, "px"]] as const;

export function PlayerOtherScreenSettings({ screens, selected, onSelect, onChange }: {
  screens: WebPlayerScreens; selected: WebPlayerScreenId; onSelect: (id: WebPlayerScreenId) => void; onChange: (screens: WebPlayerScreens) => void;
}) {
  const panel = screens.panels[selected];
  const edit = (patch: Partial<WebPlayerScreenPanel>) => onChange({ ...screens, panels: { ...screens.panels, [selected]: { ...panel, ...patch } } });
  return <>
    <div className="skin-section-heading"><h4>把每一页都照顾好</h4><p>先选页面，再调整窗体。配色与字体沿用当前皮肤，手机自动收窄。</p></div>
    <label>正在编辑的界面<select aria-label="正在编辑的界面" value={selected} onChange={event => onSelect(event.target.value as WebPlayerScreenId)}>{Object.entries(WEB_PLAYER_SCREEN_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <p className="skin-screen-description">{descriptions[selected]}</p>
    <div className="skin-screen-presets" aria-label="本页布局预设">
      <button type="button" onClick={() => edit({ width: 560, radius: 14, padding: 20, placement: "center" })}>紧凑卡片</button>
      <button type="button" onClick={() => edit({ width: 1040, radius: 28, padding: 32, placement: "center" })}>宽阔面板</button>
      <button type="button" onClick={() => edit({ width: 460, radius: 20, padding: 24, placement: "right" })}>侧边抽屉</button>
    </div>
    {ranges.map(([label, key, min, max, step, unit]) => <label className="skin-range" key={key}><span>{label}<span aria-hidden="true" className="skin-range-value">{panel[key]}{unit}</span></span><input aria-label={label} type="range" min={min} max={max} step={step} value={panel[key]} onChange={event => edit({ [key]: Number(event.target.value) })} /></label>)}
    <label>本页位置<select aria-label="本页位置" value={panel.placement} onChange={event => edit({ placement: event.target.value as WebPlayerScreenPanel["placement"] })}><option value="center">居中</option><option value="right">靠右</option></select></label>
    <label>本页入场动效<select aria-label="本页入场动效" value={panel.motion} onChange={event => edit({ motion: event.target.value as WebPlayerScreenPanel["motion"] })}><option value="none">无</option><option value="fade">渐显</option><option value="rise">轻盈上浮</option></select></label>
    {selected === "save" && <label>宽屏存档列数<select aria-label="宽屏存档列数" value={screens.saveColumns} onChange={event => onChange({ ...screens, saveColumns: Number(event.target.value) as 1 | 2 | 3 })}><option value="1">一列</option><option value="2">两列</option><option value="3">三列</option></select></label>}
    {selected === "ending" && <>
      <label>结局引导文字<input aria-label="结局引导文字" maxLength={50} value={screens.ending.caption} onChange={event => onChange({ ...screens, ending: { ...screens.ending, caption: event.target.value } })} /></label>
      <label>结局说明<textarea aria-label="结局说明" rows={3} maxLength={300} value={screens.ending.note} onChange={event => onChange({ ...screens, ending: { ...screens.ending, note: event.target.value } })} /></label>
      <label>返回按钮文字<input aria-label="返回按钮文字" maxLength={24} value={screens.ending.returnLabel} onChange={event => onChange({ ...screens, ending: { ...screens.ending, returnLabel: event.target.value } })} /></label>
    </>}
    <button type="button" onClick={() => onChange({ ...screens, panels: Object.fromEntries(Object.entries(screens.panels).map(([id, item]) => [id, { ...item, radius: panel.radius, padding: panel.padding, opacity: panel.opacity, fontSize: panel.fontSize, motion: panel.motion }])) as WebPlayerScreens["panels"] })}>统一窗体风格</button>
    <small>将本页圆角、间距、透明度、字号和动效应用到其他页面，各页宽度与位置保留。可撤销。</small>
    <button type="button" onClick={() => { const defaults = defaultWebPlayerScreens(); onChange({ ...screens, panels: { ...screens.panels, [selected]: defaults.panels[selected] }, ...(selected === "save" ? { saveColumns: defaults.saveColumns } : {}), ...(selected === "ending" ? { ending: defaults.ending } : {}) }); }}>恢复本页默认</button>
  </>;
}
