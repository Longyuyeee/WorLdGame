import type { JsonObject, JsonValue } from "@world-studio/project-domain";

type Scalar = boolean | number | string;
const object = (value: JsonValue | undefined): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value);
// Deliberately narrower than Runtime: no identifiers, invalid types or non-finite
// intermediates. Short-circuiting matches Runtime; no eval or variable defaults.
export function constantCondition(ast: JsonValue | undefined): boolean | undefined {
  const pending = [ast]; let count = 0;
  while (pending.length > 0) {
    const node = pending.pop();
    if (++count > 512 || !object(node)) return undefined;
    if (node.kind === "identifier") return undefined;
    if (node.kind === "unary") pending.push(node.operand);
    else if (node.kind === "binary") pending.push(node.left, node.right);
    else if (node.kind !== "literal") return undefined;
  }
  const evaluate = (value: JsonValue | undefined): Scalar => {
    if (!object(value)) throw new Error("invalid AST");
    let result: Scalar;
    if (value.kind === "literal") {
      if (!["boolean", "number", "string"].includes(typeof value.value)) throw new Error("invalid literal");
      result = value.value as Scalar;
    } else if (value.kind === "unary") {
      const operand = evaluate(value.operand);
      if (value.operator === "!" && typeof operand === "boolean") result = !operand;
      else if (value.operator === "-" && typeof operand === "number") result = -operand;
      else throw new Error("invalid unary");
    } else {
      const left = evaluate(value.left), op = value.operator;
      if (op === "&&" && left === false) return false;
      if (op === "||" && left === true) return true;
      const right = evaluate(value.right);
      if ((op === "&&" || op === "||") && typeof left === "boolean" && typeof right === "boolean") result = right;
      else if ((op === "==" || op === "!=") && typeof left === typeof right) result = op === "==" ? left === right : left !== right;
      else if (op === "+" && typeof left === "string" && typeof right === "string") result = left + right;
      else if (typeof left === "number" && typeof right === "number") {
        switch (op) {
          case "+": result = left + right; break;
          case "-": result = left - right; break;
          case "*": result = left * right; break;
          case "/": if (right === 0) throw new Error("division by zero"); result = left / right; break;
          case "<": result = left < right; break;
          case "<=": result = left <= right; break;
          case ">": result = left > right; break;
          case ">=": result = left >= right; break;
          default: throw new Error("invalid operator");
        }
      } else throw new Error("invalid operands");
    }
    if (typeof result === "number" && !Number.isFinite(result)) throw new Error("non-finite");
    return result;
  };
  try { const result = evaluate(ast); return typeof result === "boolean" ? result : undefined; }
  catch { return undefined; }
}
