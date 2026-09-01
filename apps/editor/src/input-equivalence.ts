export const ROUTE_NODE_NUDGE_PIXELS = 24;

export type RouteNodeNudgeDirection = "left" | "right" | "up" | "down";

export interface InputEquivalencePath {
  readonly task: string;
  readonly keyboard: string;
  readonly pointerOrTouch: string;
  readonly canonicalEffect: string;
}

export const INPUT_EQUIVALENCE_PATHS: readonly InputEquivalencePath[] = [
  { task: "选择剧情步骤", keyboard: "Enter / Space", pointerOrTouch: "点按步骤卡", canonicalEffect: "select-statement" },
  { task: "提交文本批次", keyboard: "Ctrl/Cmd+S", pointerOrTouch: "失焦或停止输入 350ms", canonicalEffect: "稳定 ID Patch" },
  { task: "插入剧情步骤", keyboard: "Ctrl+Enter", pointerOrTouch: "点按插入", canonicalEffect: "P0 insert" },
  { task: "调整剧情步骤顺序", keyboard: "Alt+Up / Alt+Down", pointerOrTouch: "点按上移 / 下移", canonicalEffect: "P0 move" },
  { task: "调整舞台提示顺序", keyboard: "Alt+Left / Alt+Right", pointerOrTouch: "点按左移 / 右移", canonicalEffect: "stage move" },
  { task: "调整路线节点位置", keyboard: "Alt+Arrow keys", pointerOrTouch: "点按四向移动", canonicalEffect: "layout sidecar position" },
  { task: "舞台对象定位", keyboard: "Inspector 数值输入", pointerOrTouch: "预览画布拖动", canonicalEffect: "typed stage directive" }
] as const;

export function routeNodeNudge(direction: RouteNodeNudgeDirection): Readonly<{ dx: number; dy: number }> {
  switch (direction) {
    case "left": return { dx: -ROUTE_NODE_NUDGE_PIXELS, dy: 0 };
    case "right": return { dx: ROUTE_NODE_NUDGE_PIXELS, dy: 0 };
    case "up": return { dx: 0, dy: -ROUTE_NODE_NUDGE_PIXELS };
    case "down": return { dx: 0, dy: ROUTE_NODE_NUDGE_PIXELS };
  }
}
