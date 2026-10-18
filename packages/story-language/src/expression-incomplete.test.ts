import { expect, it } from "vitest";
import { parseTypedExpression } from "./expression";

it.each(["(", "(count +", "1 +", "!", "count >", '"unfinished'])("reports incomplete expression %s without reading past EOF", source => {
  const result = parseTypedExpression(source, { count: "number" });
  expect(result.issues.length).toBeGreaterThan(0);
});
