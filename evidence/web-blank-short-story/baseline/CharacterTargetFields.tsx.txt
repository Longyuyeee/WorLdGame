import type { AssetIndex } from "@world-studio/project-persistence";
import type { DirectionStageContext } from "./direction-stage-context";

export function CharacterTargetFields({ context, index, value, action, disabled, label, onChange }: {
  readonly context: DirectionStageContext; readonly index: AssetIndex; readonly value: string; readonly action: string;
  readonly disabled: boolean; readonly label: string; readonly onChange: (slot: string) => void;
}) {
  const known = context.characters.some(layer => layer.slot === value);
  return <div className="character-target-fields">
    <label><span>{action === "show" ? "登场方式" : "操作哪位角色"}</span><select aria-label={`${label}选择`} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
      {action === "show" && <option value={context.newSlot}>添加一位角色（保留其他角色）</option>}
      {!known && value !== (action === "show" ? context.newSlot : "") && <option value={value}>{action === "show" ? "当前角色位置" : "其他场景继承的角色位置"} · {value}</option>}
      {value === "" && <option value="">请选择舞台上的角色</option>}
      {context.characters.map((layer, number) => <option key={layer.slot} value={layer.slot}>{action === "show" ? "替换" : "操作"}：{index.assets.find(asset => asset.assetId === layer.assetId)?.displayName ?? "未找到立绘"} · 位置 {number + 1}</option>)}
    </select></label>
    <small>根据本场景此前的演出列出角色。跨场景继承的角色可在下方填写位置标识；完整试玩确认实际路线。</small>
    <details><summary>角色位置标识（高级）</summary><input aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} /><small>同一标识会替换或操作同一位角色，请勿随意更改。</small></details>
  </div>;
}
