import { afterEach, expect, it, vi } from "vitest";
import { captureBrowserSavePreview } from "./browser-save-preview";
import { saveReadingExcerpt } from "./save-reading-excerpt";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
const request = { projectId: "project", sceneId: "scene", runtimeStateHash: "first", maximumWidth: 512, maximumHeight: 512, maximumBytes: 524288, mimeTypes: ["image/webp", "image/png"] } as const;
it("refuses a different frame and a detached or zero-sized stage", async () => {
  expect(await captureBrowserSavePreview(null, request)).toBeNull();
  document.body.innerHTML = '<main data-runtime-state-hash="second"><section class="player-stage"></section></main>';
  expect(await captureBrowserSavePreview(document.querySelector("main"), request)).toBeNull();
  document.querySelector("main")!.dataset.runtimeStateHash = "first";
  expect(await captureBrowserSavePreview(document.querySelector("main"), request)).toBeNull();
});
it("freezes source text before asynchronous encoding and excludes save/menu overlays", async () => {
  document.body.innerHTML = '<main data-runtime-state-hash="first"><section class="player-stage"><div class="player-stage-world"></div><button class="player-dialogue">Saved sentence</button><div class="player-control-layer">Do not capture menu</div></section></main>';
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 1000, height: 500 } as DOMRect);
  // jsdom has indexed computed declarations; browsers additionally expose an iterator.
  let svg = "", finish!: () => void;
  vi.stubGlobal("Image", class { set src(value: string) { if (value) svg = decodeURIComponent(value.split(",").slice(1).join(",")); } decode() { return new Promise<void>(resolve => { finish = resolve; }); } });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["image"], { type: "image/webp" })));
  const dialogue = document.querySelector<HTMLElement>(".player-dialogue")!;
  dialogue.style.display = "flex"; dialogue.style.flexDirection = "column"; dialogue.style.gap = "12px";
  Object.defineProperty(dialogue, "clientWidth", { value: 500 }); dialogue.scrollTop = 20;
  const result = captureBrowserSavePreview(document.querySelector("main"), request);
  document.querySelector(".player-dialogue")!.textContent = "Later sentence";
  await vi.waitFor(() => expect(svg).toContain("Saved sentence"));
  expect(svg).not.toContain("Later sentence"); expect(svg).not.toContain("Do not capture menu");
  expect(svg).toContain("translate(0px, -20px)"); expect(svg).toContain("gap: 12px"); expect(svg).toContain("height: max-content");
  finish(); expect(await result).toMatchObject({ width: 512, height: 256 });
});
it("strips ruby and caps saved text on Unicode code points", () => {
  expect(saveReadingExcerpt({ kind: "narration", text: "  ｜明日《あした》\n 再见  " } as never)).toBe("明日 再见");
  expect(Array.from(saveReadingExcerpt({ kind: "narration", text: "😀".repeat(200) } as never)!)).toHaveLength(160);
});
it("copies the live media canvas synchronously and refuses an oversized style resource", async () => {
  document.body.innerHTML = '<main data-runtime-state-hash="first"><section class="player-stage"><div class="player-stage-world"><canvas width="2000" height="1000"></canvas></div></section></main>';
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 1000, height: 500 } as DOMRect);
  const draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D);
  const data = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,YQ==");
  const original = document.querySelector("canvas")!;
  const stage = document.querySelector<HTMLElement>(".player-stage")!; stage.style.backgroundImage = 'url("https://example.invalid/texture.png")';
  const cancel = vi.fn(), reader = { read: async () => ({ value: new Uint8Array(8 * 1024 * 1024 + 1), done: false }), cancel: async () => { cancel(); }, releaseLock: vi.fn() };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, body: { getReader: () => reader } })));
  const pending = captureBrowserSavePreview(document.querySelector("main"), request);
  expect(draw).toHaveBeenCalledWith(original, 0, 0, 512, 256); expect(data).toHaveBeenCalledOnce();
  await expect(pending).rejects.toThrow("budget"); expect(cancel).toHaveBeenCalledOnce();
});
