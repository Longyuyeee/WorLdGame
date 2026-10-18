import { useMemo, useState } from "react";
import { ROUTE_TARGET_PAGE_SIZE, searchRouteTargets } from "./route-repair";

interface Props {
  readonly scenes: readonly { readonly id: string; readonly title: string }[];
  readonly currentTargetId: string;
  readonly targetId: string;
  readonly sourceSceneId: string;
  readonly disabled: boolean;
  readonly onSelect: (id: string) => void;
}

export function RouteTargetPicker({ scenes, currentTargetId, targetId, sourceSceneId, disabled, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const page = useMemo(() => searchRouteTargets(scenes, query, offset), [scenes, query, offset]);
  const name = (id: string) => scenes.find((scene) => scene.id === id)?.title ?? `缺失场景 ${id}`;
  return <section className="route-target-picker" aria-label="按名称选择路线目标">
    <label>搜索整个工程的场景<input type="search" aria-label="搜索路线目标" placeholder="场景名称或 ID，不受图上过滤限制" value={query} disabled={disabled} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} /></label>
    <p role="status">{page.total === 0 ? "没有匹配场景，请修改搜索词；当前连接未改变。" : `${page.start + 1}–${page.start + page.targets.length} / ${page.total} 个场景`}</p>
    <div className="route-target-picker__results">
      {page.targets.map((scene) => <button type="button" key={scene.id} aria-label={`选择目标场景：${scene.title} · ${scene.id}`} aria-pressed={scene.id === targetId} disabled={disabled} onClick={() => onSelect(scene.id)}><strong>{scene.title}</strong><code>{scene.id}</code></button>)}
    </div>
    {page.total > ROUTE_TARGET_PAGE_SIZE && <nav aria-label="路线目标分页">
      <button type="button" disabled={disabled || page.start === 0} onClick={() => setOffset(page.start - ROUTE_TARGET_PAGE_SIZE)}>上一页目标</button>
      <button type="button" disabled={disabled || page.start + ROUTE_TARGET_PAGE_SIZE >= page.total} onClick={() => setOffset(page.start + ROUTE_TARGET_PAGE_SIZE)}>下一页目标</button>
    </nav>}
    <p>当前连接：{name(currentTargetId)} → 待应用：{name(targetId)}。应用后从目标场景入口开始，不改变其他选项；可撤销。</p>
    {targetId === sourceSceneId && <p role="status">目标是当前场景，会重新进入本场景；请检查是否有可退出的选择。</p>}
  </section>;
}
