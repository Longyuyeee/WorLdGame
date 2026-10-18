import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createBlobDigest, type AssetIndex } from "@world-studio/project-persistence";
import { DirectionInspector } from "./App";
const index: AssetIndex = { schemaVersion: 1, indexRevision: 1, assets: [
  { assetId: "old", kind: "background", displayName: "原背景", tags: [], source: { digest: createBlobDigest(new Uint8Array([1])), byteLength: 1, mimeType: "image/png" }, preservedFields: { inspection: { status: "pass", width: 1, height: 1 } } },
  { assetId: "new", kind: "background", displayName: "候车室", tags: [], source: { digest: createBlobDigest(new Uint8Array([2])), byteLength: 1, mimeType: "image/png" }, preservedFields: { inspection: { status: "pass", width: 1, height: 1 } } }
] };
it("selects media by display name and protects or discards an existing direction draft", () => {
  const dispatch = vi.fn(), dirty = vi.fn();
  render(<DirectionInspector statement={{ kind: "direction", id: "stmt", command: "background", summary: "action=set asset=old custom=preserved" }} assetIndex={index} disabled={false} createCommandId={() => "cmd"} dispatch={dispatch} onDirtyChange={dirty} />);
  fireEvent.change(screen.getByLabelText("演出主资源"), { target: { value: "new" } });
  expect(screen.getByLabelText("演出主资源")).toHaveValue("new"); expect(dirty).toHaveBeenLastCalledWith(true);
  expect(dispatch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "放弃演出修改" }));
  expect(screen.getByLabelText("演出主资源")).toHaveValue("old"); expect(dirty).toHaveBeenLastCalledWith(false);
  fireEvent.change(screen.getByLabelText("演出主资源"), { target: { value: "new" } }); fireEvent.click(screen.getByRole("button", { name: "应用演出参数" }));
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ parameters: expect.objectContaining({ asset: "new" }) }));
  expect(dirty).toHaveBeenLastCalledWith(false);
});
it("keeps a rejected transaction draft and prevents an unsupported volume from reaching Compiler", () => {
  const dirty = vi.fn(), dispatch = vi.fn(() => { throw Error("源事务拒绝，请重试"); });
  const audioIndex: AssetIndex = { ...index, assets: [{ ...index.assets[0]!, assetId: "music", kind: "audio", displayName: "音乐", source: { ...index.assets[0]!.source, mimeType: "audio/wav" } }] };
  render(<DirectionInspector statement={{ kind: "direction", id: "stmt", command: "audio", summary: "action=play asset=music bus=bgm volume=0.2" }} assetIndex={audioIndex} disabled={false} createCommandId={() => "cmd"} dispatch={dispatch} onDirtyChange={dirty} />);
  fireEvent.change(screen.getByLabelText("音频音量"), { target: { value: "0.1234" } });
  expect(screen.getByRole("button", { name: "应用演出参数" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("音频音量"), { target: { value: ".3" } }); fireEvent.click(screen.getByRole("button", { name: "应用演出参数" }));
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ parameters: expect.objectContaining({ volume: "0.3" }) }));
  expect(screen.getByRole("alert")).toHaveTextContent("源事务拒绝"); expect(screen.getByLabelText("音频音量")).toHaveValue(".3"); expect(dirty).toHaveBeenLastCalledWith(true);
});
