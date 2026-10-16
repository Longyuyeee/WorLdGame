import type { WorldPlayerPreviewCaptureRequestV1, WorldPlayerPreviewCaptureResultV1 } from "./PlayerShell";

export interface PreviewFont { readonly runtimeFamily: string; readonly url: string; }
const MAX_NODES = 256, MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const XHTML = "http://www.w3.org/1999/xhtml";

/** This is a picture of the reading surface, not of its save/menu overlays.
 * Clone computed layout and copy live media BEFORE the first await. The detached
 * tree never reads the Player again, even if serialization waits in a queue. */
export function captureBrowserSavePreview(
  root: HTMLElement | null, request: WorldPlayerPreviewCaptureRequestV1,
  fonts: readonly PreviewFont[] = [], signal?: AbortSignal
): Promise<WorldPlayerPreviewCaptureResultV1 | null> {
  if (!root || root.dataset.runtimeStateHash !== request.runtimeStateHash) return Promise.resolve(null);
  const stage = root.querySelector<HTMLElement>(".player-stage");
  if (!stage) return Promise.resolve(null);
  const bounds = stage.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return Promise.resolve(null);
  const scale = Math.min(1, request.maximumWidth / bounds.width, request.maximumHeight / bounds.height);
  const width = Math.max(1, Math.round(bounds.width * scale)), height = Math.max(1, Math.round(bounds.height * scale));
  const assets = new Map<string, string>(), jobs: Array<() => Promise<void>> = [];
  let nodes = 0, bytes = 0, rasterBytes = 0;
  const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
  const fetchAsset = async (url: string, limit: number) => {
    signal?.throwIfAborted();
    const response = await fetch(url, { signal: signal ?? null });
    if (!response.ok) throw Error("Preview resource unavailable");
    const reader = response.body?.getReader();
    if (!reader) throw Error("Preview resource unreadable");
    const parts: Uint8Array<ArrayBuffer>[] = []; let size = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength; bytes += part.value.byteLength;
        if (size > limit || bytes > MAX_SOURCE_BYTES) throw Error("Preview resource budget exceeded");
        parts.push(part.value);
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    return dataUrl(new Blob(parts, { type: response.headers.get("content-type") ?? "application/octet-stream" }));
  };
  const inlineUrls = (value: string): string => value.replace(/url\(["']?([^"')]+)["']?\)/gu, (_match, url: string) => {
    // Even data URLs are kept out of the serialized style until after the tree
    // is frozen. No network references are allowed in the final SVG image.
    if (!assets.has(url)) {
      const token = `WORLD_PREVIEW_ASSET_${assets.size}_`; assets.set(url, token);
      jobs.push(async () => { assets.set(url, await fetchAsset(url, 8 * 1024 * 1024)); });
    }
    return `url("${assets.get(url)}")`;
  });
  const clone = (source: Element, shallow = false): HTMLElement => {
    if (++nodes > MAX_NODES) throw Error("Preview surface budget exceeded");
    const computed = getComputedStyle(source);
    let target: HTMLElement;
    if (source instanceof HTMLImageElement || source instanceof HTMLCanvasElement || source instanceof HTMLVideoElement) {
      if (source.getAttribute("aria-busy") === "true" || source instanceof HTMLImageElement && (!source.complete || !source.naturalWidth) || source instanceof HTMLVideoElement && source.readyState < 2) throw Error("Preview media not ready");
      const canvas = document.createElement("canvas");
      const naturalWidth = source instanceof HTMLImageElement ? source.naturalWidth : source instanceof HTMLVideoElement ? source.videoWidth : source.width;
      const naturalHeight = source instanceof HTMLImageElement ? source.naturalHeight : source instanceof HTMLVideoElement ? source.videoHeight : source.height;
      const mediaScale = Math.min(1, 512 / naturalWidth, 512 / naturalHeight);
      canvas.width = Math.max(1, Math.round(naturalWidth * mediaScale)); canvas.height = Math.max(1, Math.round(naturalHeight * mediaScale));
      try {
        const context = canvas.getContext("2d"); if (!context) throw Error("Preview canvas unavailable");
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        const raster = canvas.toDataURL("image/png"); rasterBytes += raster.length;
        if (rasterBytes > 4 * 1024 * 1024) throw Error("Preview media budget exceeded");
        target = document.createElementNS(XHTML, "img"); (target as HTMLImageElement).src = raster;
      } finally { canvas.width = canvas.height = 0; }
    } else {
      target = document.createElementNS(XHTML, source.tagName.toLowerCase());
      for (const child of shallow ? [] : source.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) target.appendChild(document.createTextNode(child.textContent ?? ""));
        else if (child instanceof Element && !child.matches("script,style,audio,source,i")) target.appendChild(clone(child));
      }
    }
    for (const key of Array.from({ length: computed.length }, (_, index) => computed.item(index))) {
      if (!key.startsWith("--") && !key.startsWith("animation") && !key.startsWith("transition")) target.style.setProperty(key, inlineUrls(computed.getPropertyValue(key)));
    }
    target.style.animation = "none"; target.style.transition = "none";
    // Preserve the current scroll position, without changing the real Player.
    if (source.scrollTop || source.scrollLeft) {
      const inner = document.createElementNS(XHTML, "div"); inner.append(...target.childNodes);
      // The wrapper must keep the content's original flex/grid layout; a plain
      // block would move the speaker, remove gaps and misrepresent long text.
      for (const key of ["display", "flex-direction", "flex-wrap", "gap", "align-items", "justify-content", "grid-template-columns", "grid-template-rows"]) inner.style.setProperty(key, computed.getPropertyValue(key));
      Object.assign(inner.style, { width: `${Math.max(0, source.clientWidth - parseFloat(computed.paddingLeft || "0") - parseFloat(computed.paddingRight || "0"))}px`, height: "max-content", transform: `translate(${-source.scrollLeft}px, ${-source.scrollTop}px)` });
      target.style.display = "block"; target.append(inner);
    }
    return target;
  };
  let frozen: HTMLElement;
  try {
    frozen = clone(stage, true);
    // Only current story art/text/choices/ending; never capture a menu or the
    // thumbnails themselves. Keep the original DOM so focus and Auto are intact.
    frozen.replaceChildren(...Array.from(stage.children).filter(node => node.matches(".player-stage-world,.player-dialogue,.player-choice,.player-ending")).map(node => clone(node)));
    Object.assign(frozen.style, { position: "relative", width: `${bounds.width}px`, height: `${bounds.height}px`, margin: "0", transform: "none", boxSizing: "border-box" });
  } catch { return Promise.resolve(null); }
  return (async () => {
    await Promise.all(jobs.map(job => job()));
    const fontRules = await Promise.all(fonts.map(async font => `@font-face{font-family:${JSON.stringify(font.runtimeFamily)};src:url("${await fetchAsset(font.url, 32 * 1024 * 1024)}")}`));
    let markup = new XMLSerializer().serializeToString(frozen);
    let index = 0; for (const value of assets.values()) markup = markup.replaceAll(`WORLD_PREVIEW_ASSET_${index++}_`, value.replaceAll("&", "&amp;"));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${bounds.width} ${bounds.height}"><foreignObject width="100%" height="100%"><div xmlns="${XHTML}"><style>${fontRules.join("")}</style>${markup}</div></foreignObject></svg>`;
    if (svg.length > 16 * 1024 * 1024) return null;
    signal?.throwIfAborted();
    const image = new Image();
    const cancel = () => { image.src = ""; };
    signal?.addEventListener("abort", cancel, { once: true });
    let canvas: HTMLCanvasElement | undefined;
    try {
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode(); signal?.throwIfAborted();
      canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d"); if (!context) return null;
      context.drawImage(image, 0, 0);
      const output = canvas;
      const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, "image/webp", .82));
      return blob && blob.size <= request.maximumBytes ? { blob, width, height } : null;
    } finally { if (canvas) canvas.width = canvas.height = 0; signal?.removeEventListener("abort", cancel); image.src = ""; }
  })();
}
