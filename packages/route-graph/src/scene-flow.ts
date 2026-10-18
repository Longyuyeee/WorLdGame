import type { ProjectAnalysisResult, RuntimeInstructionV1 } from "@world-studio/project-compiler";

export interface SceneFlowTarget {
  readonly label: string;
  readonly sceneId?: string;
  readonly statementId?: string;
  readonly missing?: boolean;
}
export interface SceneFlowStep {
  readonly id: string;
  readonly opcode: string;
  readonly targets: readonly SceneFlowTarget[];
}

// A read-only projection of the exact instruction order used by Runtime.
// Return destinations are dynamic: never invent a static edge to a caller.
export function projectSceneFlow(analysis: ProjectAnalysisResult, sceneId: string): readonly SceneFlowStep[] {
  const instructions = analysis.cache.scenes[sceneId]?.scene.instructions ?? [];
  const labels = new Map(instructions.filter((instruction) => instruction.opcode === "label").map((instruction) => [instruction.operands.name, instruction.instructionId]));
  const target = (instruction: RuntimeInstructionV1, label: string): SceneFlowTarget => {
    const sceneTarget = instruction.operands.targetSceneId;
    if (typeof sceneTarget === "string") return { label, sceneId: sceneTarget, ...(analysis.cache.scenes[sceneTarget] === undefined ? { missing: true } : {}) };
    const statementId = labels.get(instruction.operands.targetLabel);
    return statementId === undefined ? { label: `${label}：目标缺失`, missing: true } : { label, sceneId, statementId };
  };
  return instructions.map((instruction, index) => {
    const next = (label: string): SceneFlowTarget => instructions[index + 1] === undefined
      ? { label: `${label}：场景末尾，无后续语句` }
      : { label, sceneId, statementId: instructions[index + 1]!.instructionId };
    let targets: readonly SceneFlowTarget[];
    switch (instruction.opcode) {
      case "condition": targets = [target(instruction, "成立"), next("不成立")]; break;
      case "jump": targets = [target(instruction, "跳转")]; break;
      case "call": targets = [target(instruction, "进入调用"), next("执行返回后")]; break;
      case "return": targets = [{ label: "由调用栈决定：返回最近调用的下一步；空栈报错" }]; break;
      case "end": targets = [{ label: "结束剧情（不执行后续语句）" }]; break;
      case "choice": targets = Array.isArray(instruction.operands.options) ? instruction.operands.options.flatMap((option) => {
        if (option === null || typeof option !== "object" || Array.isArray(option) || typeof option.targetSceneId !== "string") return [];
        return [{ label: String(option.label), sceneId: option.targetSceneId, ...(analysis.cache.scenes[option.targetSceneId] === undefined ? { missing: true } : {}) }];
      }) : []; break;
      default: targets = [next("继续")];
    }
    return { id: instruction.instructionId, opcode: instruction.opcode, targets };
  });
}
