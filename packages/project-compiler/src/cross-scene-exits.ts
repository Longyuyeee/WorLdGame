import type { CompilerDiagnostic, CompilerSceneCacheEntryV1 } from "./types";

// Conservative scene-level analysis, not condition solving or call-stack execution.
// Iterative graph traversal keeps deep projects off the JavaScript call stack.
export function crossSceneExitDiagnostics(
  cache: Readonly<Record<string, CompilerSceneCacheEntryV1>>,
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  reachable: ReadonlySet<string>,
  sceneTitles: ReadonlyMap<string, string> = new Map()
): readonly CompilerDiagnostic[] {
  const reverse = new Map<string, string[]>();
  const exits = new Set<string>();
  for (const id of reachable) {
    const entry = cache[id];
    if (entry === undefined) continue;
    // A return may escape to a caller. Invalid syntax/references mean unknown,
    // while existing no-exit/local-loop errors are known structural dead ends.
    if (entry.endings.length > 0 || entry.scene.instructions.some((item) => item.opcode === "return") ||
      entry.diagnostics.some((item) => item.severity === "error" && item.code !== "SCENE_NO_EXIT" && item.code !== "NON_INTERACTIVE_LOOP")) exits.add(id);
    for (const target of graph.get(id) ?? []) {
      if (!reachable.has(target)) continue;
      const predecessors = reverse.get(target);
      if (predecessors === undefined) reverse.set(target, [id]); else predecessors.push(id);
    }
  }
  const queue = [...exits];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const predecessor of reverse.get(queue[cursor]!) ?? []) {
      if (!exits.has(predecessor)) { exits.add(predecessor); queue.push(predecessor); }
    }
  }
  const unsafe = new Set([...reachable].filter((id) => !exits.has(id)));
  if (unsafe.size === 0) return [];
  const visited = new Set<string>();
  const order: string[] = [];
  for (const root of unsafe) {
    if (visited.has(root)) continue;
    visited.add(root);
    const stack = [{ id: root, edges: [...(graph.get(root) ?? [])], cursor: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const next = frame.edges[frame.cursor++];
      if (next === undefined) { order.push(frame.id); stack.pop(); }
      else if (unsafe.has(next) && !visited.has(next)) {
        visited.add(next); stack.push({ id: next, edges: [...(graph.get(next) ?? [])], cursor: 0 });
      }
    }
  }
  const assigned = new Set<string>();
  const closedCycles = new Set<string>();
  for (const root of order.reverse()) {
    if (assigned.has(root)) continue;
    const members = new Set<string>([root]); const pending = [root]; assigned.add(root);
    for (let cursor = 0; cursor < pending.length; cursor += 1) {
      for (const previous of reverse.get(pending[cursor]!) ?? []) {
        if (unsafe.has(previous) && !assigned.has(previous)) { assigned.add(previous); members.add(previous); pending.push(previous); }
      }
    }
    const cyclic = members.size > 1 || graph.get(root)?.has(root) === true;
    const closed = [...members].every((id) => [...(graph.get(id) ?? [])].every((target) => members.has(target)));
    if (cyclic && closed) for (const id of members) closedCycles.add(id);
  }
  const diagnostics: CompilerDiagnostic[] = [];
  for (const id of reachable) {
    const entry = cache[id];
    if (entry === undefined) continue;
    const unreachableStatements = new Set(entry.diagnostics.filter((item) => item.code === "UNREACHABLE_STATEMENT").map((item) => item.statementId));
    for (const instruction of entry.scene.instructions) {
      if (unreachableStatements.has(instruction.instructionId)) continue;
      const targets: string[] = [];
      if (["jump", "condition", "call"].includes(instruction.opcode) && typeof instruction.operands.targetSceneId === "string") targets.push(instruction.operands.targetSceneId);
      if (instruction.opcode === "choice" && Array.isArray(instruction.operands.options)) {
        for (const option of instruction.operands.options) if (option !== null && typeof option === "object" && !Array.isArray(option) && typeof option.targetSceneId === "string") targets.push(option.targetSceneId);
      }
      const risky = [...new Set(targets.filter((target) => unsafe.has(target)))];
      if (risky.length === 0) continue;
      const cycle = closedCycles.has(id);
      diagnostics.push({ severity: "warning", code: cycle ? "CROSS_SCENE_CLOSED_CYCLE" : "CROSS_SCENE_NO_EXIT",
        sceneId: id, statementId: instruction.instructionId,
        message: `场景「${sceneTitles.get(id) ?? id}」${cycle ? "属于跨场景闭环" : "的此连接可能进入无出口路线"}，目标：${risky.slice(0, 3).map((target) => `「${sceneTitles.get(target) ?? target}」`).join("、")}${risky.length > 3 ? ` 等 ${risky.length} 个目标` : ""}。结构上未找到通往结局或返回的出口；请检查此选择/跳转并补充出口。条件与调用需实际试玩确认，此提示不禁止有意设计的循环。` });
    }
  }
  return diagnostics;
}
