import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createBlobDigest, type AssetIndexEntry } from "@world-studio/project-persistence";
import { AssetLibraryPreview } from "./asset-library-card";
const bytes = new Uint8Array([1, 2, 3]);
const entry: AssetIndexEntry = { assetId: "image", displayName: "立绘", kind: "character", tags: [], source: { digest: createBlobDigest(bytes), byteLength: 3, mimeType: "image/png" }, preservedFields: { inspection: { status: "pass" } } };
afterEach(() => vi.unstubAllGlobals());
it("releases a verified image preview on close", async () => {
  const create = vi.fn(() => "blob:image"), revoke = vi.fn();
  vi.stubGlobal("URL", class extends URL { static override createObjectURL = create; static override revokeObjectURL = revoke; });
  const view = render(<AssetLibraryPreview entry={entry} reader={{ read: async () => bytes }} />);
  await waitFor(() => expect(screen.getByRole("img", { name: "立绘" })).toHaveAttribute("src", "blob:image"));
  view.unmount(); expect(revoke).toHaveBeenCalledWith("blob:image");
});
it.each([new Uint8Array([1]), new Uint8Array([3, 2, 1])])("does not show a wrong-length or wrong-digest thumbnail", async bad => {
  const create = vi.fn();
  vi.stubGlobal("URL", class extends URL { static override createObjectURL = create; static override revokeObjectURL = vi.fn(); });
  render(<AssetLibraryPreview entry={entry} reader={{ read: async () => bad }} />);
  await act(async () => {}); expect(create).not.toHaveBeenCalled(); expect(screen.queryByRole("img")).toBeNull();
});
