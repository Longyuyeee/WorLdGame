import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
it('explains a failed image read and retries without changing the asset', async () => {
  const create = vi.fn(() => 'blob:retry'), revoke = vi.fn(); vi.stubGlobal('URL', class extends URL { static override createObjectURL = create; static override revokeObjectURL = revoke; });
  const read = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(bytes), view = render(<AssetLibraryPreview entry={entry} reader={{ read }} />);
  await screen.findByText(/图片读取失败/); fireEvent.click(screen.getByRole('button', { name: '重新准备图片预览' }));
  await waitFor(() => expect(screen.getByRole('img', { name: '立绘' })).toHaveAttribute('src', 'blob:retry'));
  fireEvent.error(screen.getByRole('img')); expect(screen.getByText(/图片无法显示/)).toBeInTheDocument(); view.unmount(); expect(revoke).toHaveBeenCalledWith('blob:retry');
});
