import {
  createBlobDigest,
  type AssetIndexEntry,
  type BlobDigest
} from "./asset-blob";

export const ASSET_METADATA_SIDECAR_RECIPE_NAME = "metadata-sidecar/v1";
export const ASSET_METADATA_SIDECAR_MIME_TYPE = "application/vnd.world-studio.asset-sidecar+json";

const RECIPE_BYTES = new TextEncoder().encode("world-studio:metadata-sidecar:v1");
export const ASSET_METADATA_SIDECAR_RECIPE_DIGEST: BlobDigest = createBlobDigest(RECIPE_BYTES);

export interface PreparedAssetDerivative {
  readonly bytes: Uint8Array;
  readonly digest: BlobDigest;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly parentDigest: BlobDigest;
  readonly recipeDigest: BlobDigest;
  readonly recipeName: string;
}
export function prepareAssetMetadataSidecar(entry: AssetIndexEntry): PreparedAssetDerivative {
  const source = JSON.stringify({
    schemaVersion: 1,
    recipe: ASSET_METADATA_SIDECAR_RECIPE_NAME,
    assetId: entry.assetId,
    kind: entry.kind,
    displayName: entry.displayName,
    tags: [...entry.tags].sort(),
    source: {
      digest: entry.source.digest,
      byteLength: entry.source.byteLength,
      mimeType: entry.source.mimeType
    }
  });
  const bytes = new TextEncoder().encode(source);
  return {
    bytes,
    digest: createBlobDigest(bytes),
    byteLength: bytes.byteLength,
    mimeType: ASSET_METADATA_SIDECAR_MIME_TYPE,
    parentDigest: entry.source.digest,
    recipeDigest: ASSET_METADATA_SIDECAR_RECIPE_DIGEST,
    recipeName: ASSET_METADATA_SIDECAR_RECIPE_NAME
  };
}
