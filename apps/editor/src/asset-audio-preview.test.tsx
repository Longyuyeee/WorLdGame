import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createBlobDigest, type AssetIndexEntry } from "@world-studio/project-persistence";
import { AssetLibraryPreview } from "./asset-library-card";
const bytes = new Uint8Array([1, 2, 3]);
const entry: AssetIndexEntry = { assetId: "music", displayName: "音乐", kind: "audio", tags: [],
  source: { digest: createBlobDigest(bytes), byteLength: 3, mimeType: "audio/wav" }, preservedFields: { inspection: { status: "pass" } } };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("does not autoplay and releases the preview on close", async () => {
  const create = vi.fn(() => "blob:audio"), revoke = vi.fn(), pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.stubGlobal("URL", class extends URL { static override createObjectURL = create; static override revokeObjectURL = revoke; });
  const view = render(<AssetLibraryPreview entry={entry} reader={{ read: async () => bytes }} />);
  await waitFor(() => expect(screen.getByLabelText("试听 音乐")).toHaveAttribute("preload", "none"));
  expect(screen.getByLabelText("试听 音乐")).not.toHaveAttribute("autoplay");
  view.unmount(); expect(pause).toHaveBeenCalled(); expect(revoke).toHaveBeenCalledWith("blob:audio");
});
it("reports missing audio and permits a retry without keeping late results", async () => {
  const read = vi.fn().mockResolvedValue(null);
  const view = render(<AssetLibraryPreview entry={entry} reader={{ read }} />);
  await screen.findByText(/音频读取失败/); expect(screen.queryByLabelText("试听 音乐")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "重新准备试听" }));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  view.unmount(); await act(async () => {});
});
