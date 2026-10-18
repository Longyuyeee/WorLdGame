/** Public player storage/progress contracts. Keep Runtime's exact bytes and
 * validation semantics without making platform shells depend on Runtime. */
export {
  canonicalRuntimeStringify as canonicalPlayerDataStringifyV1,
  mergeRuntimeMetaProgressV1 as mergePlayerCollectionProgressV1,
  validateRuntimeMetaProgressV1 as validatePlayerCollectionProgressV1
} from "@world-studio/runtime";
export type { RuntimeMetaProgressV1 as PlayerCollectionProgressV1 } from "@world-studio/runtime";
