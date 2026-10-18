import { constantCondition } from "./constant-condition";
import { crossSceneExitDiagnostics } from "./cross-scene-exits";
import type { CompilerDiagnostic, CompilerSceneCacheEntryV1 } from "./types";

// Read-only diagnostic projection. Never rewrite IR, catalogs or cached entries.
export function conditionAwareExitDiagnostics(
  cache: Readonly<Record<string, CompilerSceneCacheEntryV1>>,
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  reachable: ReadonlySet<string>,
  titles: ReadonlyMap<string, string>,
  entrySceneId: string
): readonly CompilerDiagnostic[] {
  const projected: Record<string, CompilerSceneCacheEntryV1> = {};
  const refined = new Map<string, ReadonlySet<string>>();
  const warnings = new Map<string, CompilerDiagnostic[]>();
  for (const id of reachable) {
    const entry = cache[id]; if (entry === undefined) continue;
    const instructions = entry.scene.instructions;
    const invalid = new Set(entry.diagnostics.filter(d => d.severity === "error").map(d => d.statementId));
    const constants = new Map<number, boolean>();
    instructions.forEach((item, index) => {
      if (item.opcode !== "condition" || invalid.has(item.instructionId)) return;
      const value = constantCondition(item.operands.expressionAst);
      if (value !== undefined) constants.set(index, value);
    });
    if (constants.size === 0) { projected[id] = entry; refined.set(id, graph.get(id) ?? new Set()); continue; }
    const labels = new Map(instructions.flatMap((item, index) => item.opcode === "label" && typeof item.operands.name === "string" ? [[item.operands.name, index] as const] : []));
    const seen = new Set<number>(); const queue = instructions.length ? [0] : []; const targets = new Set<string>();
    const findings: CompilerDiagnostic[] = [];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor]!; if (seen.has(index)) continue; seen.add(index);
      const item = instructions[index]!; const value = constants.get(index);
      if (value !== undefined) findings.push({ severity: "warning", code: value ? "CONSTANT_CONDITION_TRUE" : "CONSTANT_CONDITION_FALSE", sceneId: id, statementId: item.instructionId,
        message: `此条件不含变量，结果恒为${value ? "真" : "假"}。${value ? "总会跳到目标，不会直接继续下一步" : "不会跳到目标，只会继续下一步；此连接不能作为路线出口"}。请检查条件表达式和目标；如需按玩家选择分流，请使用变量条件。有意设计的常量条件可以保留。` });
      const followsTarget = item.opcode !== "condition" || value !== false;
      if (["jump", "call", "condition"].includes(item.opcode) && followsTarget) {
        const target = item.operands.targetSceneId;
        if (typeof target === "string") targets.add(target);
        const local = typeof item.operands.targetLabel === "string" ? labels.get(item.operands.targetLabel) : undefined;
        if (local !== undefined) queue.push(local);
      }
      if (item.opcode === "choice" && Array.isArray(item.operands.options)) {
        for (const option of item.operands.options) if (option !== null && typeof option === "object" && !Array.isArray(option) && typeof option.targetSceneId === "string") targets.add(option.targetSceneId);
      }
      if (!["jump", "choice", "return", "end"].includes(item.opcode) && !(item.opcode === "condition" && value === true) && index + 1 < instructions.length) queue.push(index + 1);
    }
    const live = instructions.filter((_, index) => seen.has(index));
    const liveIds = new Set(live.map(item => item.instructionId));
    // False target instructions are omitted only from the diagnostic projection:
    // the UI retains the original source connection so it remains editable.
    projected[id] = { ...entry, scene: { ...entry.scene, instructions: instructions.filter((_, index) => seen.has(index) && constants.get(index) !== false) }, endings: entry.endings.filter(end => liveIds.has(end.endingId)) };
    refined.set(id, targets); warnings.set(id, findings);
  }
  const refinedReachable = new Set<string>(); const queue = reachable.has(entrySceneId) ? [entrySceneId] : [];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor]!; if (refinedReachable.has(id)) continue; refinedReachable.add(id);
    for (const target of refined.get(id) ?? []) if (reachable.has(target) && !refinedReachable.has(target)) queue.push(target);
  }
  return [...[...refinedReachable].flatMap(id => warnings.get(id) ?? []), ...crossSceneExitDiagnostics(projected, refined, refinedReachable, titles)];
}
