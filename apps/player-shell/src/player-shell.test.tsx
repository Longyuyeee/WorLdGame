import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, type CanonicalProject, type S0Project } from "@world-studio/project-domain";
import { PlayerShell } from "./PlayerShell";
import { createPlayerMediaDemoV1, createPlayerMediaMultichannelDemoV1 } from "./media-demo";

function branching(): CanonicalProject {
  const source = JSON.parse(readFileSync(join(process.cwd(), "fixtures/projects/branching/project.s0.json"), "utf8")) as S0Project;
  return loadProject(migrateS0Project(source).files);
}

describe("N50-E1 shared Player Shell", () => {
  it("exposes formal identities and supports pointer input from title through choice", () => {
    const { container } = render(<PlayerShell project={branching()} />);
    const shell = container.querySelector("main");
    expect(shell).toHaveAttribute("data-player-core", "0.3.0");
    expect(shell).toHaveAttribute("data-compiler", "0.2.0");
    expect(shell).toHaveAttribute("data-runtime", "0.6.0");
    expect(shell).toHaveAttribute("data-runtime-host", "0.1.0");
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(screen.getByRole("group", { name: "Choose a route" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Left/u }));
    expect(screen.getByText("Guide")).toBeInTheDocument();
    expect(screen.getByText("The quiet route.")).toBeInTheDocument();
  });

  it("provides keyboard-equivalent start, choice, and advance controls", () => {
    const { container } = render(<PlayerShell project={branching()} />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-choice");
    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByText("The bright route.")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByRole("status")).toHaveTextContent("Right");
  });

  it("uses directional keyboard selection and returns from an ending to a fresh title state", () => {
    const { container } = render(<PlayerShell project={branching()} />);
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: /Right/u })).toHaveAttribute("data-player-selected", "true");
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByText("The bright route.")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByRole("status")).toHaveTextContent("Right");
    expect(container.querySelector("main")).toHaveAttribute("data-input-source", "keyboard");
    fireEvent.click(screen.getByRole("button", { name: "回到标题" }));
    expect(screen.getByRole("button", { name: /开始故事/u })).toBeInTheDocument();
    expect(container.querySelector("main")).toHaveAttribute("data-player-status", "title");
    expect(container.querySelector("main")).toHaveAttribute("data-input-source", "pointer");
  });

  it("fails closed to a fresh Core when the platform host replaces the project identity", () => {
    const first = branching();
    const media = createPlayerMediaDemoV1();
    const view = render(<PlayerShell project={first} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(screen.getByRole("group", { name: "Choose a route" })).toBeInTheDocument();
    view.rerender(<PlayerShell project={{ ...first }} />);
    expect(screen.getByRole("group", { name: "Choose a route" })).toBeInTheDocument();
    view.rerender(<PlayerShell project={media.project} mediaAssets={media.mediaAssets} />);
    expect(screen.queryByRole("group", { name: "Choose a route" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /开始故事/u })).toBeInTheDocument();
    expect(view.container.querySelector("main")).toHaveAttribute("data-player-status", "title");
    expect(view.container.querySelector("main")).toHaveAttribute("data-input-source", "lifecycle");
  });

  it("renders real Stage media and completes an awaited Effect from the visible transition lifecycle", () => {
    const demo = createPlayerMediaDemoV1();
    const { container } = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-effect");
    expect(screen.getByRole("status", { name: /正在呈现动效 player.media.actor.enter/u })).toBeInTheDocument();
    expect(container.querySelector('img[data-asset-id="media_sunset"]')).toBeInTheDocument();
    expect(container.querySelector('img[data-asset-id="media_actor_sprite"]')).toBeInTheDocument();
    fireEvent.animationEnd(screen.getByTestId("player-effect-progress"));
    expect(screen.getByText("Every cue must remain ordered.")).toBeInTheDocument();
    const audio = container.querySelector<HTMLAudioElement>('audio[data-asset-id="media_theme"]');
    expect(audio).toBeInTheDocument();
    expect(audio).toHaveAttribute("data-volume", "0.6");
    expect(audio).toHaveAttribute("data-applied-volume", "0.6");
    expect(audio?.volume).toBe(0.6);
    expect(container.querySelector("main")).toHaveAttribute("data-effect-operation", "execute");
  });

  it("fails visibly when a required media asset is unavailable instead of auto-completing the Effect", () => {
    const demo = createPlayerMediaDemoV1();
    render(<PlayerShell project={demo.project} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(screen.getByRole("alert")).toHaveTextContent("media_actor_sprite");
    expect(screen.getByRole("button", { name: "完成动效" })).toBeDisabled();
    fireEvent.animationEnd(screen.getByTestId("player-effect-progress"));
    expect(screen.getByRole("status", { name: /正在呈现动效/u })).toBeInTheDocument();
  });

  it("recovers a missing awaited asset from a new platform source generation", () => {
    const demo = createPlayerMediaDemoV1();
    function RecoveryHarness() {
      const [ready, setReady] = useState(false);
      return <PlayerShell
        project={demo.project}
        mediaAssets={ready ? demo.mediaAssets : demo.mediaAssets.filter((asset) => asset.assetId !== "media_actor_sprite")}
        onRetryMedia={() => setReady(true)}
      />;
    }
    render(<RecoveryHarness />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(screen.getByRole("alert")).toHaveTextContent("media_actor_sprite");
    expect(screen.getByRole("button", { name: "完成动效" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "重试媒体" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成动效" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "完成动效" }));
    expect(screen.getByText("Every cue must remain ordered.")).toBeInTheDocument();
  });

  it("keeps two character slots and two audio buses active without channel overwrite", () => {
    const demo = createPlayerMediaMultichannelDemoV1();
    const { container } = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(screen.getByText("Every cue must remain ordered.")).toBeInTheDocument();
    expect(container.querySelectorAll('img[data-asset-id="media_actor_sprite"]')).toHaveLength(2);
    expect([...container.querySelectorAll("img[data-stage-slot]")].map((node) => node.getAttribute("data-stage-slot"))).toEqual(["left", "right"]);
    expect([...container.querySelectorAll("audio[data-audio-bus]")].map((node) => node.getAttribute("data-audio-bus"))).toEqual(["bgm", "voice"]);
  });
});
