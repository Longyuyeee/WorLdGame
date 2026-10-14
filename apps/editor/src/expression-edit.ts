import { parseTypedExpression, type ExpressionValueType } from "@world-studio/story-language";

export type AuthoringVariableType = "boolean" | "number" | "string";
export type VariableAssignmentOperation = "set" | "add" | "subtract";

export function expressionLiteral(type: AuthoringVariableType, value: string): string {
  if (type === "string") return JSON.stringify(value);
  if (type === "boolean") {
    if (value !== "true" && value !== "false") throw new Error("请选择“是”或“否”。");
    return value;
  }
  if (!value.trim() || !Number.isFinite(Number(value))) throw new Error("请输入有效数值。");
  const literal = String(Number(value));
  if (parseTypedExpression(literal).issues.length > 0) throw new Error("数值超出当前表达式可使用的范围。");
  return literal;
}

export function assignmentExpression(variable: string, type: AuthoringVariableType, operation: VariableAssignmentOperation, value: string): string {
  const literal = expressionLiteral(type, value);
  if (operation === "set") return literal;
  if (type !== "number" || Number(value) < 0) throw new Error("只有数值变量能增减，增减量需为非负数。");
  return `${variable} ${operation === "add" ? "+" : "-"} ${literal}`;
}

export function assignmentDraft(variable: string, expression: string, type: AuthoringVariableType) {
  let literal = expression, operation: VariableAssignmentOperation = "set";
  const parsed = parseTypedExpression(expression), root = parsed.root;
  if (root?.kind === "binary" && ["+", "-"].includes(root.operator) && root.left.kind === "identifier" && root.left.name === variable && type === "number") {
    literal = expression.slice(root.right.start, root.right.end); operation = root.operator === "+" ? "add" : "subtract";
  }
  try {
    const value: unknown = JSON.parse(literal);
    if (typeof value === type && (type !== "number" || Number.isFinite(value)) && (operation === "set" || Number(value) >= 0)) return { simple: true, operation, value: String(value) };
  } catch { /* Keep a complex expression intact until the author explicitly replaces it. */ }
  return { simple: false, operation: "set" as VariableAssignmentOperation, value: type === "boolean" ? "false" : type === "number" ? "0" : "" };
}

export function comparisonDraft(expression: string, variableIds: readonly string[], variableTypes: Readonly<Record<string, AuthoringVariableType>> = {}) {
  const first = variableIds[0] ?? "", firstType = variableTypes[first] ?? "number";
  const fallback = { variable: first, operator: firstType === "number" ? ">=" : "==", type: firstType, value: firstType === "number" ? "1" : firstType === "boolean" ? "true" : "" };
  const match = /^([A-Za-z_][\w.-]*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(expression);
  if (!match || !variableIds.includes(match[1]!)) return fallback;
  try {
    const literal: unknown = JSON.parse(match[3]!), type = typeof literal;
    if (!["number", "boolean", "string"].includes(type) || (type !== "number" && !["==", "!="].includes(match[2]!)) || (variableTypes[match[1]!] && variableTypes[match[1]!] !== type)) return fallback;
    return { variable: match[1]!, operator: match[2]!, type: type as AuthoringVariableType, value: String(literal) };
  } catch { return fallback; }
}

export function expressionProblem(expression: string, variableTypes: Readonly<Record<string, ExpressionValueType>>, expected: ExpressionValueType): string | null {
  const parsed = parseTypedExpression(expression, variableTypes);
  if (!parsed.root || parsed.issues.some(item => item.code === "INVALID_TOKEN" || item.code === "UNEXPECTED_TOKEN")) return "表达式不完整，请检查括号、引号和运算符。";
  if (parsed.issues.some(item => item.code === "UNKNOWN_VARIABLE")) return "表达式引用了未登记的变量，请重新选择或先声明变量。";
  if (parsed.issues.some(item => item.code === "TYPE_MISMATCH") || (expected !== "unknown" && parsed.valueType !== "unknown" && parsed.valueType !== expected)) return "表达式的类型不匹配，请使用该变量对应的值或运算。";
  return null;
}
