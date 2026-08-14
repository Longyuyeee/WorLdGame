import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PreviewCanvasHitProxy,
  PreviewCanvasHost,
  drawPreviewCanvasFrame,
  previewCanvasDurationMs,
  resolvePreviewCanvasCharacterRect,
  type PreviewCanvasImageSet
} from "./preview-canvas-host";
import type { PreviewRenderFrame } from "./preview-render-host";

const character = {
  statementId: "stmt_hero",
  assetId: "hero",
  slot: "primary",
  url: "blob:hero",
  x: 25,
  y: 75,
  scale: 1.2,
  rotation: 10,
  anchorX: 0.5,
  anchorY: 1,
  z: 4
} as const;

const frame: PreviewRenderFrame = {
  contractVersion: 2,
  backend: "canvas-2d-v1",
  status: "ready",
  generation: 3,
  planKey: "frame-3",
  background: { statementId: "stmt_bg", assetId: "school", url: "blob:bg" },
  characters: [character],
  errorCount: 0
};

describe("Preview Canvas host", () => {
  it("fits character geometry into design pixels before applying the authored scale", () => {
    const rect = resolvePreviewCanvasCharacterRect(character, 1000, 2000, 1920, 1080);
    expect(rect.width).toBeCloseTo(583.2);
    expect(rect.height).toBeCloseTo(1166.4);
    expect(rect.offsetX).toBeCloseTo(-291.6);
    expect(rect.offsetY).toBeCloseTo(-1166.4);
  });

  it("draws background before ordered characters at the frozen DPR pixel budget", () => {
    const calls: string[] = [];
    const gradient = { addColorStop: vi.fn() };
    const context = {
      setTransform: (...args: unknown[]) => calls.push(`transform:${args.join(",")}`),
      clearRect: () => calls.push("clear"),
      createLinearGradient: () => gradient,
      fillRect: () => calls.push("fill"),
      drawImage: (...args: unknown[]) => calls.push(`draw:${String(args[0])}`),
      save: () => calls.push("save"),
      translate: () => calls.push("translate"),
      rotate: () => calls.push("rotate"),
      restore: () => calls.push("restore"),
      fillStyle: "",
      shadowColor: "",
      shadowBlur: 0,
      shadowOffsetY: 0
    } as unknown as CanvasRenderingContext2D;
    const images: PreviewCanvasImageSet = {
      background: { source: "background-source" as unknown as CanvasImageSource, width: 1600, height: 900 },
      characters: new Map([["stmt_hero", { source: "hero-source" as unknown as CanvasImageSource, width: 1000, height: 2000 }]])
    };

    drawPreviewCanvasFrame(context, frame, images, 1920, 1080, 3840, 2160, "stmt_hero");

    expect(calls[0]).toBe("transform:2,0,0,2,0,0");
    expect(calls.indexOf("draw:background-source")).toBeLessThan(calls.indexOf("draw:hero-source"));
    expect(context.shadowColor).toBe("rgba(98, 215, 255, 0.85)");
  });

  it("interpolates authored move geometry and bounds animation duration", () => {
    const translate = vi.fn();
    const context = {
      setTransform: vi.fn(), clearRect: vi.fn(), createLinearGradient: () => ({ addColorStop: vi.fn() }),
      fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), translate, rotate: vi.fn(), restore: vi.fn(),
      fillStyle: "", shadowColor: "", shadowBlur: 0, shadowOffsetY: 0
    } as unknown as CanvasRenderingContext2D;
    const movedFrame: PreviewRenderFrame = {
      ...frame,
      background: undefined,
      characters: [{ ...character, x: 75, movementFrom: { x: 25, y: 75, scale: 1.2, rotation: 10, anchorX: 0.5, anchorY: 1 } }]
    };
    drawPreviewCanvasFrame(context, movedFrame, {
      characters: new Map([["stmt_hero", { source: "hero" as unknown as CanvasImageSource, width: 1000, height: 2000 }]])
    }, 1920, 1080, 3840, 2160, "stmt_hero", 0.5);
    expect(translate).toHaveBeenCalledWith(960, 810);
    expect(previewCanvasDurationMs("600ms")).toBe(600);
    expect(previewCanvasDurationMs("0.5s")).toBe(500);
    expect(previewCanvasDurationMs("999s")).toBe(10_000);
    expect(previewCanvasDurationMs("invalid")).toBe(300);
  });

  it("fades an exiting character while retaining its final authored geometry", () => {
    const context = {
      setTransform: vi.fn(), clearRect: vi.fn(), createLinearGradient: () => ({ addColorStop: vi.fn() }),
      fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), translate: vi.fn(), rotate: vi.fn(), restore: vi.fn(),
      globalAlpha: 1, fillStyle: "", shadowColor: "", shadowBlur: 0, shadowOffsetY: 0
    } as unknown as CanvasRenderingContext2D;
    const exiting = { ...character, statementId: "stmt_hide", exiting: true, duration: "450ms" } as const;
    drawPreviewCanvasFrame(context, { ...frame, background: undefined, characters: [exiting] }, {
      characters: new Map([["stmt_hide", { source: "hero" as unknown as CanvasImageSource, width: 1000, height: 2000 }]])
    }, 1920, 1080, 3840, 2160, "stmt_hide", 0.5);
    expect(context.globalAlpha).toBe(0.5);
    expect(context.translate).toHaveBeenCalledWith(480, 810);
  });

  it("keeps Canvas visuals separate from a keyboard and touch operable DOM proxy", () => {
    const onSelect = vi.fn();
    const onStagePoint = vi.fn();
    const movingCharacter = { ...character, duration: "600ms", movementFrom: {
      x: 10, y: 75, scale: 1.2, rotation: 0, anchorX: 0.5, anchorY: 1
    } } as const;
    render(<div data-stage-surface="design-pixels">
      <PreviewCanvasHitProxy
        character={movingCharacter}
        selected
        designWidth={1920}
        designHeight={1080}
        onSelect={onSelect}
        onStagePoint={onStagePoint}
      />
    </div>);
    const target = screen.getByRole("button", { name: "选择 Stage 角色 hero" });
    const surface = target.parentElement as HTMLElement;
    surface.getBoundingClientRect = () => ({
      x: 10, y: 20, left: 10, top: 20, right: 970, bottom: 560,
      width: 960, height: 540, toJSON: () => ({})
    });
    fireEvent.pointerDown(target, { pointerType: "touch", clientX: 490, clientY: 290 });
    fireEvent.click(target);
    expect(onStagePoint).toHaveBeenCalledWith({ x: 960, y: 540 });
    expect(onSelect).toHaveBeenCalledWith("stmt_hero");
    expect(target).toHaveAttribute("aria-pressed", "true");
    expect(target).toHaveStyle({ zIndex: 4 });
    expect(target).toHaveClass("stage-canvas-hit-proxy--moving");
    expect(target.style.animationDuration).toBe("600ms");
    expect(target.style.getPropertyValue("--stage-move-from-left")).toBe("10%");
  });

  it("makes an exiting Canvas hit proxy inert while its visual fades", () => {
    render(<PreviewCanvasHitProxy
      character={{ ...character, statementId: "stmt_hide", exiting: true, transition: "fade", duration: "450ms" }}
      selected={false}
      designWidth={1920}
      designHeight={1080}
      onSelect={() => undefined}
      onStagePoint={() => undefined}
    />);
    const target = screen.getByTestId("preview-character-primary");
    expect(target).toBeDisabled();
    expect(target).toHaveAttribute("aria-hidden", "true");
    expect(target).toHaveAttribute("tabindex", "-1");
    expect(target).toHaveClass("stage-canvas-hit-proxy--exiting");
    expect(target.style.animationDuration).toBe("450ms");
  });

  it("falls back to the DOM media host when Canvas 2D is unavailable", async () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(<div data-stage-surface="design-pixels">
      <PreviewCanvasHost
        frame={frame}
        designWidth={1920}
        designHeight={1080}
        pixelWidth={3840}
        pixelHeight={2160}
        selectedStatementId="stmt_hero"
        onSelect={() => undefined}
        onStagePoint={() => undefined}
        onRuntimeError={() => undefined}
      />
    </div>);
    await waitFor(() => expect(screen.getByTestId("preview-visual-host")).toHaveAttribute("data-render-backend", "dom-media-v1"));
    expect(screen.getByRole("img", { name: "背景资源 school" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择 Stage 角色 hero" })).toBeInTheDocument();
    context.mockRestore();
  });
});
