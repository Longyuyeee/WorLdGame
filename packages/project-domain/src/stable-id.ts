import { sha256 } from "./sha256";

const TOKEN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/** Hosts provide durable entropy; display names are intentionally excluded so renames never alter IDs. */
export function createStableId(kind: string, durableEntropy: string): string {
  if (!TOKEN.test(kind) || durableEntropy.length < 8) throw new Error("Stable ID input is invalid");
  return `${kind}_${sha256(durableEntropy).slice(0, 20)}`;
}

export function isStableId(value: string): boolean { return TOKEN.test(value); }
