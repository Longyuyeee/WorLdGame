import type { StoryProject, StoryStatement } from "@world-studio/story-core";
import { parseTypedExpression, type ExpressionNode, type ExpressionValueType } from "@world-studio/story-language";

export type PlayableValue = boolean | number | string;
export type PlayablePreviewStatus = "idle" | "presenting" | "waiting-choice" | "ended" | "error";

export interface PlayableReturnPoint {
  readonly sceneId: string;
  readonly statementIndex: number;
}

export interface PlayablePreviewState {
  readonly status: PlayablePreviewStatus;
  readonly sceneId: string | null;
  readonly statementIndex: number;
  readonly variables: Readonly<Record<string, PlayableValue>>;
  readonly callStack: readonly PlayableReturnPoint[];
  readonly visitedStatementIds: readonly string[];
  readonly visitedSceneIds: readonly string[];
  readonly controlStepCount: number;
  readonly endingName?: string;
  readonly error?: string;
}

const MAX_CONTROL_STEPS = 1_000;

export function createIdlePlayablePreviewState(): PlayablePreviewState {
  return {
    status: "idle",
    sceneId: null,
    statementIndex: 0,
    variables: {},
    callStack: [],
    visitedStatementIds: [],
    visitedSceneIds: [],
    controlStepCount: 0
  };
}

function fail(state: PlayablePreviewState, error: string): PlayablePreviewState {
  return { ...state, status: "error", error };
}

function variableTypes(variables: Readonly<Record<string, PlayableValue>>): Readonly<Record<string, ExpressionValueType>> {
  return Object.fromEntries(Object.entries(variables).map(([name, value]) => [name, typeof value as ExpressionValueType]));
}

function evaluateNode(node: ExpressionNode, variables: Readonly<Record<string, PlayableValue>>): PlayableValue {
  if (node.kind === "literal") return node.value;
  if (node.kind === "identifier") {
    const value = variables[node.name];
    if (value === undefined) throw new Error(`变量尚未赋值：${node.name}`);
    return value;
  }
  if (node.kind === "unary") {
    const operand = evaluateNode(node.operand, variables);
    if (node.operator === "!") {
      if (typeof operand !== "boolean") throw new Error("逻辑取反只接受布尔值");
      return !operand;
    }
    if (typeof operand !== "number") throw new Error("数值取负只接受数字");
    return -operand;
  }
  const left = evaluateNode(node.left, variables);
  if (node.operator === "&&") {
    if (typeof left !== "boolean") throw new Error("逻辑与只接受布尔值");
    if (!left) return false;
    const right = evaluateNode(node.right, variables);
    if (typeof right !== "boolean") throw new Error("逻辑与只接受布尔值");
    return right;
  }
  if (node.operator === "||") {
    if (typeof left !== "boolean") throw new Error("逻辑或只接受布尔值");
    if (left) return true;
    const right = evaluateNode(node.right, variables);
    if (typeof right !== "boolean") throw new Error("逻辑或只接受布尔值");
    return right;
  }
  const right = evaluateNode(node.right, variables);
  switch (node.operator) {
    case "==": return left === right;
    case "!=": return left !== right;
    case "+":
      if (typeof left === "number" && typeof right === "number") return left + right;
      if (typeof left === "string" && typeof right === "string") return left + right;
      throw new Error("加法两侧必须同为数字或字符串");
    case "-":
    case "*":
    case "/":
    case "<":
    case "<=":
    case ">":
    case ">=": {
      if (typeof left !== "number" || typeof right !== "number") throw new Error(`${node.operator} 只接受数字`);
      if (node.operator === "-") return left - right;
      if (node.operator === "*") return left * right;
      if (node.operator === "/") {
        if (right === 0) throw new Error("除数不能为零");
        return left / right;
      }
      if (node.operator === "<") return left < right;
      if (node.operator === "<=") return left <= right;
      if (node.operator === ">") return left > right;
      return left >= right;
    }
    default: throw new Error(`不支持的表达式操作符：${node.operator}`);
  }
}

function evaluateExpression(source: string, variables: Readonly<Record<string, PlayableValue>>): PlayableValue {
  const parsed = parseTypedExpression(source, variableTypes(variables));
  if (parsed.root === null || parsed.issues.length > 0) {
    throw new Error(parsed.issues[0]?.message ?? "表达式为空");
  }
  return evaluateNode(parsed.root, variables);
}

function findLabelIndex(statements: readonly StoryStatement[], label: string): number {
  return statements.findIndex((statement) => statement.kind === "label" && statement.name === label);
}

function recordVisible(state: PlayablePreviewState, statement: StoryStatement): PlayablePreviewState {
  const visitedStatementIds = [...state.visitedStatementIds, statement.id];
  if (statement.kind === "choice") return { ...state, status: "waiting-choice", visitedStatementIds };
  if (statement.kind === "end") {
    return { ...state, status: "ended", endingName: statement.endingName, visitedStatementIds };
  }
  return { ...state, status: "presenting", visitedStatementIds };
}

function settle(project: StoryProject, initial: PlayablePreviewState): PlayablePreviewState {
  let state = initial;
  for (let executed = 0; executed <= MAX_CONTROL_STEPS; executed += 1) {
    if (state.sceneId === null) return fail(state, "试玩没有活动场景");
    const scene = project.scenes.find((candidate) => candidate.id === state.sceneId);
    if (scene === undefined) return fail(state, `场景不存在：${state.sceneId}`);
    const statement = scene.statements[state.statementIndex];
    if (statement === undefined) return fail(state, `场景没有到达结局：${scene.title}`);
    if (["dialogue", "narration", "direction", "wait", "choice", "end"].includes(statement.kind)) {
      return recordVisible(state, statement);
    }
    if (state.controlStepCount >= MAX_CONTROL_STEPS) return fail(state, "控制流超过 1000 步，可能存在无限循环");
    const nextCount = state.controlStepCount + 1;
    if (statement.kind === "label" || statement.kind === "checkpoint") {
      state = { ...state, statementIndex: state.statementIndex + 1, controlStepCount: nextCount };
      continue;
    }
    if (statement.kind === "set") {
      try {
        const value = evaluateExpression(statement.expression, state.variables);
        state = {
          ...state,
          statementIndex: state.statementIndex + 1,
          variables: { ...state.variables, [statement.variable]: value },
          controlStepCount: nextCount
        };
      } catch (error) {
        return fail(state, error instanceof Error ? error.message : "变量表达式执行失败");
      }
      continue;
    }
    if (statement.kind === "condition") {
      try {
        const result = evaluateExpression(statement.expression, state.variables);
        if (typeof result !== "boolean") return fail(state, "条件表达式必须返回布尔值");
        const targetIndex = result ? findLabelIndex(scene.statements, statement.targetLabel) : state.statementIndex + 1;
        if (result && targetIndex < 0) return fail(state, `条件目标标签不存在：${statement.targetLabel}`);
        state = { ...state, statementIndex: targetIndex, controlStepCount: nextCount };
      } catch (error) {
        return fail(state, error instanceof Error ? error.message : "条件表达式执行失败");
      }
      continue;
    }
    if (statement.kind === "jump" || statement.kind === "call") {
      const targetIndex = findLabelIndex(scene.statements, statement.targetLabel);
      if (targetIndex < 0) return fail(state, `目标标签不存在：${statement.targetLabel}`);
      state = {
        ...state,
        statementIndex: targetIndex,
        callStack: statement.kind === "call"
          ? [...state.callStack, { sceneId: scene.id, statementIndex: state.statementIndex + 1 }]
          : state.callStack,
        controlStepCount: nextCount
      };
      continue;
    }
    if (statement.kind === "return") {
      const point = state.callStack.at(-1);
      if (point === undefined) return fail(state, "return 没有对应的 call");
      state = {
        ...state,
        sceneId: point.sceneId,
        statementIndex: point.statementIndex,
        callStack: state.callStack.slice(0, -1),
        controlStepCount: nextCount
      };
    }
  }
  return fail(state, "控制流无法稳定到可见步骤");
}

export function startPlayablePreview(project: StoryProject): PlayablePreviewState {
  return settle(project, {
    ...createIdlePlayablePreviewState(),
    status: "presenting",
    sceneId: project.entrySceneId,
    visitedSceneIds: [project.entrySceneId]
  });
}

export function advancePlayablePreview(project: StoryProject, state: PlayablePreviewState): PlayablePreviewState {
  if (state.status !== "presenting") return state;
  return settle(project, { ...state, statementIndex: state.statementIndex + 1 });
}

export function selectPlayableChoice(
  project: StoryProject,
  state: PlayablePreviewState,
  optionId: string
): PlayablePreviewState {
  if (state.status !== "waiting-choice" || state.sceneId === null) return state;
  const scene = project.scenes.find((candidate) => candidate.id === state.sceneId);
  const statement = scene?.statements[state.statementIndex];
  if (statement?.kind !== "choice") return fail(state, "当前步骤不是可选择节点");
  const option = statement.options.find((candidate) => candidate.id === optionId);
  if (option === undefined) return fail(state, `选择项不存在：${optionId}`);
  return settle(project, {
    ...state,
    status: "presenting",
    sceneId: option.targetSceneId,
    statementIndex: 0,
    visitedSceneIds: [...state.visitedSceneIds, option.targetSceneId]
  });
}

export function playableCurrentStatement(project: StoryProject, state: PlayablePreviewState): StoryStatement | undefined {
  if (state.sceneId === null) return undefined;
  return project.scenes.find((scene) => scene.id === state.sceneId)?.statements[state.statementIndex];
}
