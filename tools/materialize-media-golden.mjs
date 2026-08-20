import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const root = process.cwd();
const outputArgument = process.argv[2];
if (outputArgument === undefined || outputArgument.trim().length === 0) {
  console.error("Usage: node tools/materialize-media-golden.mjs <output-directory>");
  process.exitCode = 2;
} else {
  const fixturePath = join(root, "fixtures", "projects", "media", "media-golden.json");
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const outputDirectory = resolve(outputArgument);
  const extensionByMimeType = new Map([
    ["image/png", ".png"],
    ["audio/wav", ".wav"]
  ]);
  const files = [];
  await mkdir(outputDirectory, { recursive: true });
  for (const asset of fixture.assets ?? []) {
    const extension = extensionByMimeType.get(asset.mimeType);
    if (extension === undefined || typeof asset.assetId !== "string" || typeof asset.base64 !== "string") {
      throw new Error(`Media Golden contains an unsupported asset: ${asset.assetId ?? "<missing>"}`);
    }
    const bytes = Buffer.from(asset.base64, "base64");
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (bytes.toString("base64") !== asset.base64 || bytes.byteLength !== asset.byteLength || digest !== asset.sha256) {
      throw new Error(`Media Golden payload verification failed: ${asset.assetId}`);
    }
    const path = join(outputDirectory, `${asset.assetId}${extension}`);
    await writeFile(path, bytes, { flag: "wx" });
    files.push({ assetId: asset.assetId, path, fileName: basename(path), byteLength: bytes.byteLength, sha256: digest });
  }
  console.log(JSON.stringify({ status: "PASS", fixture: "fixtures/projects/media/media-golden.json", outputDirectory, files }, null, 2));
}
