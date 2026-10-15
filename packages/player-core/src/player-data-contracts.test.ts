import { expect, it } from "vitest";
import { canonicalRuntimeStringify, mergeRuntimeMetaProgressV1, validateRuntimeMetaProgressV1 } from "@world-studio/runtime";
import { canonicalPlayerDataStringifyV1, mergePlayerCollectionProgressV1, validatePlayerCollectionProgressV1 } from "./index";

it("keeps the exact canonical serializer used by existing save/backup hashes", () => {
  expect(canonicalPlayerDataStringifyV1).toBe(canonicalRuntimeStringify);
  expect(canonicalPlayerDataStringifyV1({ z: [1, { y: true, a: "雨" }], a: -0 })).toBe('{"a":0,"z":[1,{"a":"雨","y":true}]}');
});
it("preserves Runtime progress validation and merging instead of introducing another format", () => {
  expect(validatePlayerCollectionProgressV1).toBe(validateRuntimeMetaProgressV1);
  expect(mergePlayerCollectionProgressV1).toBe(mergeRuntimeMetaProgressV1);
  expect(validatePlayerCollectionProgressV1({ schemaVersion: 999 })).not.toHaveLength(0);
});
