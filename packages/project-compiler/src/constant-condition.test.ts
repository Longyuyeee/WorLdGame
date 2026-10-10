import { expect, it } from "vitest";
import { parseTypedExpression } from "@world-studio/story-language";
import { evaluateRuntimeExpressionV1 } from "@world-studio/runtime";
import type { JsonValue } from "@world-studio/project-domain";
import { constantCondition } from "./constant-condition";

it("proves only variable-free boolean conditions, with Runtime-equivalent results", () => {
  for (const expression of ["true", "false", "!false", "-2 + 3 * 4 == 10", "8 / 2 >= 4", '"a" + "b" == "ab"', "2 != 3 && 1 <= 2", "3 > 2 || false", "true || 1 / 0 > 0", "false && 1 / 0 > 0", "!(2 < 1)"]) {
    const ast = parseTypedExpression(expression).root as unknown as JsonValue;
    const runtime = evaluateRuntimeExpressionV1(ast, {});
    expect(runtime.ok).toBe(true);
    expect(constantCondition(ast), expression).toBe(runtime.ok ? runtime.value : undefined);
  }
  for (const expression of ["score == 0", "true || score == 0", "1 / 0 > 0", "1", '"text"', "true + false", '"1" == 1']) {
    expect(constantCondition(parseTypedExpression(expression).root as unknown as JsonValue), expression).toBeUndefined();
  }
  expect(constantCondition(null)).toBeUndefined();
  expect(constantCondition({ kind: "identifier", name: "__proto__" })).toBeUndefined();
  expect(constantCondition(parseTypedExpression(`${"9".repeat(200)} * ${"9".repeat(200)} > 0`).root as unknown as JsonValue)).toBeUndefined();
  let deep: JsonValue = { kind: "literal", value: true };
  for (let i = 0; i < 600; i++) deep = { kind: "unary", operator: "!", operand: deep };
  expect(constantCondition(deep)).toBeUndefined();
});
