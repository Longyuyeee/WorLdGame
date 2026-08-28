import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewStageCharacter, PreviewVisualHost } from "./preview-visual-host";

const character = {
  statementId: "stmt_show_hero",
  assetId: "asset_hero",
  slot: "hero",
  expression: "smile",
  url: "blob:hero",
  x: 25,
  y: 75,
  scale: 1.2,
  rotation: 5,
  anchorX: 0.5,
  anchorY: 1
} as const;

describe("Preview Stage character interaction", () => {
  it("exposes one pointer and keyboard operable selection target", () => {
    const onSelect = vi.fn();
    const onStagePoint = vi.fn();
    const onDecodeError = vi.fn();
    render(
      <div data-stage-surface="design-pixels">
        <PreviewStageCharacter
          character={character}
          defaultDurationMilliseconds={720}
          defaultEasing="ease-out"
          selected={false}
          designWidth={1920}
          designHeight={1080}
          onSelect={onSelect}
          onStagePoint={onStagePoint}
          onDecodeError={onDecodeError}
        />
      </div>
    );
    const target = screen.getByRole("button", { name: "选择 Stage 角色 asset_hero，表情 smile" });
    const surface = target.parentElement as HTMLElement;
    surface.getBoundingClientRect = () => ({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 970,
      bottom: 560,
      width: 960,
      height: 540,
      toJSON: () => ({})
    });

    fireEvent.pointerDown(target, { pointerType: "touch", clientX: 490, clientY: 290 });
    fireEvent.click(target);
    fireEvent.error(screen.getByRole("img", { name: "角色资源 asset_hero · smile" }));

    expect(onStagePoint).toHaveBeenCalledWith({ x: 960, y: 540 });
    expect(onSelect).toHaveBeenCalledWith("stmt_show_hero");
    expect(onDecodeError).toHaveBeenCalledOnce();
    expect(target).toHaveAttribute("aria-pressed", "false");
    expect(target).toHaveAttribute("data-stage-x", "25");
    expect(target).toHaveAttribute("data-stage-easing", "ease-out");
    expect(target).toHaveStyle({ animationDuration: "720ms", animationTimingFunction: "ease-out" });
  });

  it("renders synchronized selection feedback", () => {
    render(
      <div data-stage-surface="design-pixels">
        <PreviewStageCharacter
          character={character}
          selected
          designWidth={1920}
          designHeight={1080}
          onSelect={() => undefined}
          onStagePoint={() => undefined}
          onDecodeError={() => undefined}
        />
      </div>
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button")).toHaveClass("is-selected");
  });

  it("keeps negative character z-order inside a plane above the background", () => {
    render(
      <div data-stage-surface="design-pixels">
        <PreviewVisualHost
          frame={{
            contractVersion: 2,
            backend: "dom-media-v1",
            status: "ready",
            generation: 3,
            planKey: "scene",
            background: { statementId: "bg", assetId: "school", url: "blob:bg" },
            characters: [{ ...character, z: -100 }],
            errorCount: 0
          }}
          designWidth={1920}
          designHeight={1080}
          selectedStatementId="stmt_show_hero"
          onSelect={() => undefined}
          onStagePoint={() => undefined}
          onRuntimeError={() => undefined}
        />
      </div>
    );
    const host = screen.getByTestId("preview-visual-host");
    const backgroundPlane = host.querySelector(".stage-background-plane");
    const characterPlane = host.querySelector(".stage-character-plane");
    expect(host).toHaveAttribute("data-render-contract", "2");
    expect(host).toHaveAttribute("data-render-backend", "dom-media-v1");
    expect(backgroundPlane).not.toBeNull();
    expect(characterPlane).not.toBeNull();
    expect(backgroundPlane?.nextElementSibling).toBe(characterPlane);
    expect(screen.getByRole("button", { name: /选择 Stage 角色/ })).toHaveStyle({ zIndex: -100 });
  });
});
