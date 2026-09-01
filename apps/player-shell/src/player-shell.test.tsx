import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Blob as NodeBlob } from "node:buffer";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withPlatformSettings, withProjectSettings } from "@world-studio/gal-settings";
import { loadProject, migrateS0Project, saveProject, type CanonicalProject, type S0Project } from "@world-studio/project-domain";
import { PlayerShell } from "./PlayerShell";
import { createPlayerMediaDemoV1, createPlayerMediaMultichannelDemoV1, createPlayerVideoDemoV1 } from "./media-demo";
import { WebPlayerHost, type WebPlayerHostProps } from "./player-host";
import type { WorldPlayerSaveSlotV3, WorldPlayerSaveStoreV3 } from "./player-save-store";
import type { WorldPlayerRecoveryRecordV1, WorldPlayerRecoveryStoreV1 } from "./player-recovery-store";
import type { WorldPlayerPlaybackPolicyV1 } from "./player-playback-policy";

afterEach(() => vi.restoreAllMocks());

function branching(): CanonicalProject {
  const source = JSON.parse(readFileSync(join(process.cwd(), "fixtures/projects/branching/project.s0.json"), "utf8")) as S0Project;
  return loadProject(migrateS0Project(source).files);
}

function branchingWithCheckpoint(): CanonicalProject {
  const project = branching();
  const script = project.scripts.branch_start!;
  return {
    ...project,
    scripts: {
      ...project.scripts,
      branch_start: { ...script, statements: [{ id: "checkpoint_fork", kind: "checkpoint" }, ...script.statements] }
    }
  };
}

function autoStory(): CanonicalProject {
  const source = JSON.parse(readFileSync(join(process.cwd(), "fixtures/projects/tiny/project.s0.json"), "utf8")) as S0Project;
  const project = loadProject(migrateS0Project(source).files);
  const script = project.scripts.tiny_start!;
  return {
    ...project,
    scripts: {
      ...project.scripts,
      tiny_start: { ...script, statements: [
        { id: "auto_a", kind: "narration", textId: "auto_a_text", text: "A" },
        { id: "auto_b", kind: "narration", textId: "auto_b_text", text: "B" },
        { id: "auto_end", kind: "end", endingName: "Auto done" }
      ] }
    }
  };
}

function stopPointStory(): CanonicalProject {
  const project = autoStory();
  const script = project.scripts.tiny_start!;
  return {
    ...project,
    scripts: {
      ...project.scripts,
      tiny_start: {
        ...script,
        statements: script.statements.map((statement) => statement.id === "auto_b"
          ? { ...statement, playerStopPoint: true }
          : statement)
      }
    }
  };
}

function longSkipStory(): CanonicalProject {
  const project = autoStory();
  const script = project.scripts.tiny_start!;
  return {
    ...project,
    scripts: {
      ...project.scripts,
      tiny_start: { ...script, statements: [
        ...Array.from({ length: 12 }, (_, index) => ({ id: `skip_${index}`, kind: "narration" as const, textId: `skip_text_${index}`, text: `Line ${index}` })),
        { id: "skip_end", kind: "end" as const, endingName: "Skip done" }
      ] }
    }
  };
}

function playbackPolicy(baseDelayMilliseconds: number, voiceTailMilliseconds = 20): WorldPlayerPlaybackPolicyV1 {
  return {
    schemaVersion: 1,
    policyVersion: "1.2.0",
    auto: { baseDelayMilliseconds, millisecondsPerReadableUnit: 0, voiceTailMilliseconds, instantInstructionBudget: 128, video: "wait-for-end" },
    skip: { defaultActivation: "toggle", defaultSpeed: 20, instantInstructionBudget: 128, video: "cancel-and-continue" }
  };
}

function videoStory() {
  const demo = createPlayerVideoDemoV1("data:video/webm;base64,AAAA");
  return {
    ...demo,
    project: { ...demo.project, settings: withProjectSettings(demo.project.settings, { text: { revealMode: "instant" } }) } satisfies CanonicalProject
  };
}

const realDelay = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

describe("N50-E1 shared Player Shell", () => {
  it("exposes formal identities and supports pointer input from title through choice", () => {
    const { container } = render(<PlayerShell project={branching()} />);
    const shell = container.querySelector("main");
    expect(shell).toHaveAttribute("data-player-core", "0.5.0");
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
    expect(audio).toHaveAttribute("data-applied-volume", "0.48");
    expect(audio?.volume).toBe(0.48);
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

  it("freezes input and media while the host is suspended, then resumes the same Core", async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    const demo = createPlayerMediaMultichannelDemoV1();
    const view = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(screen.getByText("Every cue must remain ordered.")).toBeInTheDocument();
    const shell = view.container.querySelector("main")!;
    const runtimeHash = shell.getAttribute("data-player-status");

    view.rerender(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} hostActivity="suspended" />);
    expect(shell).toHaveAttribute("data-host-activity", "suspended");
    expect(screen.getByRole("status")).toHaveTextContent("宿主已暂停");
    expect(pause).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: " " });
    expect(shell).toHaveAttribute("data-player-status", runtimeHash);

    view.rerender(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} hostActivity="active" />);
    await Promise.resolve();
    expect(shell).toHaveAttribute("data-host-activity", "active");
    expect(play).toHaveBeenCalledTimes(2);
    expect([...view.container.querySelectorAll("audio")].map((node) => node.getAttribute("data-player-playback"))).toEqual(["playing", "playing"]);
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByRole("status")).toHaveTextContent("Curtain");
  });

  it("always pauses on interruption but keeps media paused when automatic resume is disabled", async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    const demo = createPlayerMediaMultichannelDemoV1();
    const configured = {
      ...demo.project,
      settings: withProjectSettings(demo.project.settings, { audio: { resumeAfterInterruption: false } })
    };
    const view = render(<PlayerShell project={configured} mediaAssets={demo.mediaAssets} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    const shell = view.container.querySelector("main")!;
    expect(shell).toHaveAttribute("data-player-status", "presenting");

    view.rerender(<PlayerShell project={configured} mediaAssets={demo.mediaAssets} hostActivity="suspended" />);
    expect(pause).toHaveBeenCalledTimes(2);
    view.rerender(<PlayerShell project={configured} mediaAssets={demo.mediaAssets} hostActivity="active" />);
    await Promise.resolve();

    expect(play).not.toHaveBeenCalled();
    expect(shell).toHaveAttribute("data-player-status", "presenting");
    expect([...view.container.querySelectorAll("audio")].map((node) => node.getAttribute("data-player-playback"))).toEqual(["paused-by-policy", "paused-by-policy"]);
  });

  it("maps real document visibility to host activity and restores keyboard input on return", () => {
    const original = Object.getOwnPropertyDescriptor(document, "visibilityState");
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    try {
      const view = render(<WebPlayerHost project={branching()} />);
      const shell = view.container.querySelector("main")!;
      expect(shell).toHaveAttribute("data-host-activity", "active");
      visibility = "hidden";
      fireEvent(document, new Event("visibilitychange"));
      expect(shell).toHaveAttribute("data-host-activity", "suspended");
      fireEvent.keyDown(window, { key: "Enter" });
      expect(shell).toHaveAttribute("data-player-status", "title");
      visibility = "visible";
      fireEvent(document, new Event("visibilitychange"));
      expect(shell).toHaveAttribute("data-host-activity", "active");
      fireEvent.keyDown(window, { key: "Enter" });
      expect(shell).toHaveAttribute("data-player-status", "waiting-choice");
    } finally {
      if (original === undefined) delete (document as unknown as Record<string, unknown>).visibilityState;
      else Object.defineProperty(document, "visibilityState", original);
    }
  });

  it("pins the Web host to the Web settings layer even when an untyped caller injects another platform", () => {
    type WebHostOwnsSettingsPlatform = "platform" extends keyof WebPlayerHostProps ? false : true;
    const webHostOwnsSettingsPlatform: WebHostOwnsSettingsPlatform = true;
    const project = branching();
    const configured = {
      ...project,
      settings: withPlatformSettings(
        withPlatformSettings(project.settings, "web", { display: { quality: "high" } }),
        "android",
        { display: { quality: "low" } }
      )
    };
    const untypedHostProps = { project: configured, platform: "android" as const };

    const { container } = render(<WebPlayerHost {...untypedHostProps} />);

    expect(webHostOwnsSettingsPlatform).toBe(true);
    expect(container.querySelector("main")).toHaveAttribute("data-settings-platform", "web");
    expect(container.querySelector("main")).toHaveAttribute("data-settings-quality", "high");
  });

  it("releases removed audio buses instead of resuming detached media", async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    const demo = createPlayerMediaMultichannelDemoV1();
    const view = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(view.container.querySelectorAll("audio")).toHaveLength(2);
    view.rerender(<PlayerShell project={branching()} hostActivity="suspended" />);
    expect(view.container.querySelectorAll("audio")).toHaveLength(0);
    expect(pause).not.toHaveBeenCalled();
    view.rerender(<PlayerShell project={branching()} hostActivity="active" />);
    await Promise.resolve();
    expect(play).not.toHaveBeenCalled();
  });
});

describe("N52-E1 Player History controls", () => {
  it("exposes accessible Back and Forward controls with truthful disabled state", () => {
    const { container } = render(<PlayerShell project={branching()} />);
    const back = screen.getByRole("button", { name: "后退一步" });
    const forward = screen.getByRole("button", { name: "前进一步" });
    expect(back).toBeDisabled();
    expect(forward).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(back).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Right/u }));
    expect(screen.getByText("The bright route.")).toBeInTheDocument();

    fireEvent.click(back);
    expect(container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-choice");
    expect(screen.getByRole("group", { name: "Choose a route" })).toBeInTheDocument();
    expect(forward).toBeEnabled();

    fireEvent.click(forward);
    expect(screen.getByText("The bright route.")).toBeInTheDocument();
    expect(forward).toBeDisabled();
  });
});

describe("N52-E4b Shell Auto real clock", () => {
  it("stops Auto on the build-authored Player Stop Point", async () => {
    const source = stopPointStory();
    const project = { ...source, settings: withProjectSettings(source.settings, { text: { revealMode: "instant" } }) };
    const { container } = render(<PlayerShell project={project} playbackPolicy={playbackPolicy(10)} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.click(screen.getByRole("button", { name: "自动播放" }));

    await screen.findByText("B", {}, { timeout: 500 });
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-playback-stop-reason", "stopPoint"));
    expect(screen.queryByText("Auto done")).not.toBeInTheDocument();
  });

  it("uses a real Shell timer to advance one formal Scheduler boundary and exposes truthful playback state", async () => {
    const project = { ...autoStory(), settings: withProjectSettings(autoStory().settings, { text: { revealMode: "instant" } }) };
    const { container } = render(<PlayerShell project={project} playbackPolicy={playbackPolicy(40)} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(screen.getByText("A")).toBeInTheDocument();

    const auto = screen.getByRole("button", { name: "自动播放" });
    fireEvent.click(auto);
    expect(auto).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-auto-playback", "waiting"));
    await screen.findByText("B", {}, { timeout: 500 });
    expect(container.querySelector("main")).toHaveAttribute("data-playback-mode", "auto");
    expect(container.querySelector("main")).toHaveAttribute("data-playback-stop-reason", "storyBoundary");
    fireEvent.click(auto);
  });

  it("does not start the Auto delay until the real text reveal has completed", async () => {
    const source = autoStory();
    const project = { ...source, settings: withProjectSettings(source.settings, { text: { charactersPerSecond: 200, minimumDisplayMilliseconds: 80, punctuationDelayMilliseconds: 0, revealMode: "typewriter" } }) };
    const { container } = render(<PlayerShell project={project} playbackPolicy={playbackPolicy(30)} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.click(screen.getByRole("button", { name: "自动播放" }));
    expect(container.querySelector("main")).toHaveAttribute("data-auto-playback", "waiting-text");
    await realDelay(55);
    expect(screen.getByText("A")).toBeInTheDocument();
    await screen.findByText("B", {}, { timeout: 350 });
  });

  it("uses the real voice element duration plus tail and stops Auto at the terminal boundary", async () => {
    const demo = createPlayerMediaMultichannelDemoV1();
    const project = { ...demo.project, settings: withProjectSettings(demo.project.settings, { text: { revealMode: "instant" } }) };
    const { container } = render(<PlayerShell project={project} mediaAssets={demo.mediaAssets} playbackPolicy={playbackPolicy(10, 40)} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    const voice = container.querySelector<HTMLAudioElement>('audio[data-audio-bus="voice"]')!;
    Object.defineProperty(voice, "duration", { configurable: true, value: 0.12 });
    Object.defineProperty(voice, "currentTime", { configurable: true, value: 0 });
    fireEvent.loadedMetadata(voice);
    fireEvent.play(voice);
    fireEvent.click(screen.getByRole("button", { name: "自动播放" }));

    await realDelay(80);
    expect(screen.getByText("Every cue must remain ordered.")).toBeInTheDocument();
    await screen.findByText("Curtain", {}, { timeout: 350 });
    expect(container.querySelector("main")).toHaveAttribute("data-playback-stop-reason", "terminal");
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-auto-playback", "stopped"));
  });

  it("clears its owned timer during Host suspend and only starts a fresh delay after resume", async () => {
    const source = autoStory();
    const project = { ...source, settings: withProjectSettings(source.settings, { text: { revealMode: "instant" } }) };
    const view = render(<PlayerShell project={project} playbackPolicy={playbackPolicy(100)} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.click(screen.getByRole("button", { name: "自动播放" }));
    await realDelay(30);
    view.rerender(<PlayerShell project={project} playbackPolicy={playbackPolicy(100)} hostActivity="suspended" />);
    await realDelay(120);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(view.container.querySelector("main")).toHaveAttribute("data-auto-playback", "suspended");

    view.rerender(<PlayerShell project={project} playbackPolicy={playbackPolicy(100)} hostActivity="active" />);
    await screen.findByText("B", {}, { timeout: 350 });
  });
});

describe("N52-E4c Shell Skip controls and cleanup", () => {
  it.each([
    ["skipRead", "toggle"],
    ["skipAll", "toggle"],
    ["skipRead", "hold"],
    ["skipAll", "hold"]
  ] as const)("stops %s/%s on the same build-authored Player Stop Point", async (mode, activation) => {
    const source = stopPointStory();
    const project = { ...source, settings: withProjectSettings(source.settings, { text: { revealMode: "instant" } }) };
    const { container } = render(<PlayerShell project={project} playbackPolicy={playbackPolicy(10)} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.change(screen.getByRole("combobox", { name: "快进激活方式" }), { target: { value: activation } });
    const skip = screen.getByRole("button", { name: mode === "skipRead" ? "快进已读" : "快进全部" });
    if (activation === "hold") fireEvent.pointerDown(skip, { pointerId: 1, pointerType: "mouse" });
    else fireEvent.click(skip);

    await screen.findByText("B", {}, { timeout: 500 });
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-playback-stop-reason", "stopPoint"));
    expect(container.querySelector("main")).toHaveAttribute("data-playback-mode", mode);
    expect(screen.queryByText("Auto done")).not.toBeInTheDocument();
  });

  it("runs Skip Read through the formal Scheduler and stops on the first unread text", async () => {
    const source = autoStory();
    const project = { ...source, settings: withProjectSettings(source.settings, { text: { revealMode: "instant" } }) };
    const { container } = render(<PlayerShell project={project} playbackPolicy={playbackPolicy(10)} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.click(screen.getByRole("button", { name: "快进已读" }));

    await screen.findByText("B", {}, { timeout: 500 });
    expect(container.querySelector("main")).toHaveAttribute("data-playback-mode", "skipRead");
    expect(container.querySelector("main")).toHaveAttribute("data-playback-stop-reason", "unreadBoundary");
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-skip-active", "false"));
  });

  it("runs Toggle Skip All at the selected speed and stops cleanly at terminal", async () => {
    const source = longSkipStory();
    const project = { ...source, settings: withProjectSettings(source.settings, { text: { revealMode: "instant" } }) };
    const { container } = render(<PlayerShell project={project} playbackPolicy={playbackPolicy(10)} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.change(screen.getByRole("combobox", { name: "快进速度" }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "快进全部" }));

    await screen.findByText("Skip done", {}, { timeout: 500 });
    expect(container.querySelector("main")).toHaveAttribute("data-playback-mode", "skipAll");
    expect(container.querySelector("main")).toHaveAttribute("data-playback-activation", "toggle");
    expect(container.querySelector("main")).toHaveAttribute("data-playback-speed", "5");
    expect(container.querySelector("main")).toHaveAttribute("data-playback-stop-reason", "terminal");
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-skip-active", "false"));
  });

  it("ends Hold Skip on pointer release, cancel, blur, and host suspend without a stale timer", async () => {
    const source = autoStory();
    const project = { ...source, settings: withProjectSettings(source.settings, { text: { revealMode: "instant" } }) };
    const view = render(<PlayerShell project={project} playbackPolicy={playbackPolicy(10)} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.change(screen.getByRole("combobox", { name: "快进激活方式" }), { target: { value: "hold" } });
    const skip = screen.getByRole("button", { name: "快进全部" });
    fireEvent.pointerDown(skip, { pointerId: 1, pointerType: "mouse" });
    expect(view.container.querySelector("main")).toHaveAttribute("data-skip-active", "true");
    fireEvent.pointerUp(skip, { pointerId: 1, pointerType: "mouse" });
    expect(view.container.querySelector("main")).toHaveAttribute("data-skip-active", "false");
    await realDelay(30);
    expect(screen.getByText("A")).toBeInTheDocument();

    fireEvent.pointerDown(skip, { pointerId: 2, pointerType: "mouse" });
    fireEvent.pointerCancel(skip, { pointerId: 2, pointerType: "mouse" });
    expect(view.container.querySelector("main")).toHaveAttribute("data-skip-active", "false");
    fireEvent.keyDown(skip, { key: " " });
    expect(view.container.querySelector("main")).toHaveAttribute("data-skip-active", "true");
    fireEvent.keyUp(window, { key: " " });
    expect(view.container.querySelector("main")).toHaveAttribute("data-skip-active", "false");
    fireEvent.pointerDown(skip, { pointerId: 3, pointerType: "mouse" });
    fireEvent.blur(window);
    expect(view.container.querySelector("main")).toHaveAttribute("data-skip-active", "false");
    fireEvent.pointerDown(skip, { pointerId: 4, pointerType: "mouse" });
    view.rerender(<PlayerShell project={project} playbackPolicy={playbackPolicy(10)} hostActivity="suspended" />);
    expect(view.container.querySelector("main")).toHaveAttribute("data-skip-active", "false");
  });

  it("accelerates real text/stage media and restores audio and presentation policy on stop", async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    const demo = createPlayerMediaMultichannelDemoV1();
    const { container } = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} playbackPolicy={playbackPolicy(10)} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.change(screen.getByRole("combobox", { name: "快进激活方式" }), { target: { value: "hold" } });
    const skip = screen.getByRole("button", { name: "快进全部" });
    fireEvent.pointerDown(skip, { pointerId: 1, pointerType: "mouse" });
    expect(container.querySelector("main")).toHaveAttribute("data-skip-media", "accelerated");
    expect(container.querySelector(".player-stage-world")).toHaveAttribute("data-skip-media", "accelerated");
    expect(pause).toHaveBeenCalled();
    fireEvent.pointerUp(skip, { pointerId: 1, pointerType: "mouse" });
    await Promise.resolve();
    expect(container.querySelector("main")).toHaveAttribute("data-skip-media", "normal");
    expect(container.querySelector(".player-stage-world")).toHaveAttribute("data-skip-media", "normal");
    expect(play).toHaveBeenCalled();
  });
});

describe("N52-E4e formal Player video policy", () => {
  it("renders an authored video asset at the existing awaited Effect boundary", async () => {
    const demo = videoStory();
    const { container } = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    await waitFor(() => expect(screen.getByRole("button", { name: "继续下一句" })).toHaveAttribute("data-text-ready", "true"));
    fireEvent.click(screen.getByRole("button", { name: "继续下一句" }));

    expect(container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-effect");
    expect(container.querySelector('video[data-asset-id="media_intro_video"]')).toHaveAttribute("data-video-policy", "awaited");
    expect(screen.getByText("视频播放中")).toBeInTheDocument();
  });

  it("keeps Auto waiting for real video ended and then continues the formal Scheduler", async () => {
    const demo = videoStory();
    const { container } = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} playbackPolicy={playbackPolicy(10)} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.click(screen.getByRole("button", { name: "自动播放" }));
    await waitFor(() => expect(container.querySelector('video[data-asset-id="media_intro_video"]')).toBeInTheDocument());
    const video = container.querySelector<HTMLVideoElement>('video[data-asset-id="media_intro_video"]')!;
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-auto-playback", "waiting-video"));
    expect(screen.queryByText("After video")).not.toBeInTheDocument();

    fireEvent.ended(video);
    await screen.findByText("After video", {}, { timeout: 500 });
    expect(container.querySelector("main")).toHaveAttribute("data-playback-mode", "auto");
  });

  it.each(["skipRead", "skipAll"] as const)("uses %s video cancel-and-continue without leaving a media element", async (mode) => {
    const demo = videoStory();
    const { container } = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} playbackPolicy={playbackPolicy(10)} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.click(screen.getByRole("button", { name: mode === "skipRead" ? "快进已读" : "快进全部" }));

    if (mode === "skipRead") {
      await realDelay(100);
      expect(screen.getByText("After video")).toBeInTheDocument();
      expect(container.querySelector("main")).toHaveAttribute("data-video-policy-stop-reason", "unreadBoundary");
      expect(container.querySelector("main")).toHaveAttribute("data-skip-active", "false");
    } else {
      await screen.findByText("Video done", {}, { timeout: 500 });
      expect(container.querySelector("main")).toHaveAttribute("data-playback-stop-reason", "terminal");
    }
    expect(container.querySelector("video")).not.toBeInTheDocument();
  });

  it("pauses on Host suspend, resumes by policy, fails closed on error, and cleans up on unmount", async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    const demo = videoStory();
    const view = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    await waitFor(() => expect(screen.getByRole("button", { name: "继续下一句" })).toHaveAttribute("data-text-ready", "true"));
    fireEvent.click(screen.getByRole("button", { name: "继续下一句" }));
    const video = view.container.querySelector<HTMLVideoElement>("video")!;

    view.rerender(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} hostActivity="suspended" />);
    expect(pause).toHaveBeenCalled();
    expect(video).toHaveAttribute("data-player-playback", "suspended");
    view.rerender(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} hostActivity="active" />);
    await waitFor(() => expect(play).toHaveBeenCalled());

    fireEvent.error(video);
    expect(screen.getByRole("alert")).toHaveTextContent("media_intro_video");
    expect(view.container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-effect");
    fireEvent.click(screen.getByRole("button", { name: "重试媒体" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(view.container.querySelector("video")).not.toBe(video);
    view.unmount();
    expect(pause).toHaveBeenCalled();
  });
});

describe("N51-E5 Player settings application", () => {
  it("keeps the active Core when a persisted v1 settings document is normalized to current v5", () => {
    const project = branching();
    const legacyFiles = { ...saveProject(project) };
    legacyFiles[project.manifest.settingsPath] = JSON.stringify({
      schemaVersion: 1,
      project: {},
      platforms: { windows: {}, web: {}, android: {} }
    });
    const migrated = loadProject(legacyFiles);
    const view = render(<PlayerShell project={project} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(view.container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-choice");

    view.rerender(<PlayerShell project={migrated} />);

    expect(migrated.settings.schemaVersion).toBe(6);
    expect(view.container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-choice");
    expect(screen.getByRole("group", { name: "Choose a route" })).toBeInTheDocument();
  });

  it("hot-applies presentation settings without resetting the active formal Core", () => {
    const project = branching();
    const view = render(<PlayerShell project={project} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(view.container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-choice");

    const updated = {
      ...project,
      settings: withPlatformSettings(project.settings, "web", {
        display: { designWidth: 1440, designHeight: 1080, orientation: "landscape", quality: "low", safeArea: "none" },
        text: { fontScale: 1.5, messageWindowOpacity: 0.4, revealMode: "instant", lineHeight: 2, letterSpacingEm: 0.08 },
        choice: { showOptionNumbers: false, layout: "responsive-grid" },
        ui: { defaultTextboxTemplate: "bubble", showInputHints: false },
        accessibility: { highContrast: true, reduceMotion: true, reduceFlashing: true }
      })
    };
    view.rerender(<PlayerShell project={updated} />);

    expect(view.container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-choice");
    expect(view.container.querySelector("main")).toHaveAttribute("data-settings-quality", "low");
    expect(view.container.querySelector("main")).toHaveAttribute("data-settings-safe-area", "none");
    expect(view.container.querySelector("main")).toHaveAttribute("data-settings-high-contrast", "true");
    expect(view.container.querySelector("main")).toHaveAttribute("data-settings-reduce-motion", "true");
    expect(view.container.querySelector("main")).toHaveAttribute("data-settings-reduce-flashing", "true");
    expect(view.container.querySelector("main")).toHaveAttribute("data-settings-choice-layout", "responsive-grid");
    expect(view.container.querySelector(".player-choice")).toHaveAttribute("data-choice-layout", "responsive-grid");
    expect(view.container.querySelectorAll("[data-choice-number]")).toHaveLength(0);
    expect(screen.getByRole("group", { name: "Choose a route" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Left/u })).toBeInTheDocument();
    expect(view.container.querySelector("main")).toHaveStyle({ "--gal-stage-aspect": "1440 / 1080", "--gal-font-scale": "1.5", "--gal-message-opacity": "0.4", "--gal-line-height": "2", "--gal-letter-spacing": "0.08em" });
  });

  it("hides only the title input hint while preserving keyboard start", () => {
    const project = branching();
    const configured = {
      ...project,
      settings: withProjectSettings(project.settings, { ui: { showInputHints: false } })
    };
    const { container } = render(<PlayerShell project={configured} />);
    expect(container.querySelector(".player-hint")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-choice");
  });

  it("uses the selected platform layer and hot-applies pointer and keyboard gates", () => {
    const project = branching();
    const gated = {
      ...project,
      settings: withPlatformSettings(project.settings, "web", { input: { pointerAdvance: false, keyboardAdvance: false } })
    };
    const view = render(<PlayerShell project={gated} platform="web" />);
    const shell = view.container.querySelector("main")!;
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(shell).toHaveAttribute("data-player-status", "title");
    expect(shell).toHaveAttribute("data-input-accepted", "false");
    fireEvent.keyDown(window, { key: "Enter" });
    expect(shell).toHaveAttribute("data-player-status", "title");

    view.rerender(<PlayerShell project={gated} platform="windows" />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(shell).toHaveAttribute("data-player-status", "waiting-choice");
    expect(shell).toHaveAttribute("data-settings-platform", "windows");
  });

  it("distinguishes touch from pointer and applies allow-hold to repeated confirms", () => {
    const project = branching();
    const touchGated = {
      ...project,
      settings: withProjectSettings(project.settings, { input: { touchAdvance: false }, advance: { allowHold: false } })
    };
    const view = render(<PlayerShell project={touchGated} />);
    const start = screen.getByRole("button", { name: /开始故事/u });
    fireEvent.pointerDown(start, { pointerType: "touch" });
    fireEvent.click(start);
    expect(view.container.querySelector("main")).toHaveAttribute("data-player-status", "title");
    fireEvent.keyDown(window, { key: "Enter", repeat: true });
    expect(view.container.querySelector("main")).toHaveAttribute("data-player-status", "title");

    const holdEnabled = { ...touchGated, settings: withProjectSettings(touchGated.settings, { advance: { allowHold: true } }) };
    view.rerender(<PlayerShell project={holdEnabled} />);
    fireEvent.keyDown(window, { key: "Enter", repeat: true });
    expect(view.container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-choice");
  });

  it("applies canonical audio gain and waits for actual voice completion before advancing", () => {
    const demo = createPlayerMediaMultichannelDemoV1();
    const configured = {
      ...demo.project,
      settings: withProjectSettings(demo.project.settings, { audio: { master: 0.5, bgm: 0.5, voiceDucking: 0.5 } })
    };
    const view = render(<PlayerShell project={configured} mediaAssets={demo.mediaAssets} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    const voice = view.container.querySelector<HTMLAudioElement>('audio[data-audio-bus="voice"]')!;
    const bgm = view.container.querySelector<HTMLAudioElement>('audio[data-audio-bus="bgm"]')!;
    expect(bgm.volume).toBeCloseTo(0.15);
    fireEvent.play(voice);
    expect(bgm.volume).toBeCloseTo(0.075);

    const dialogue = screen.getByRole("button", { name: "继续下一句" });
    fireEvent.click(dialogue);
    fireEvent.click(dialogue);
    expect(view.container.querySelector("main")).toHaveAttribute("data-player-status", "presenting");
    fireEvent.ended(voice);
    fireEvent.click(dialogue);
    expect(screen.getByRole("status")).toHaveTextContent("Curtain");
  });

  it("reopens saved platform settings and applies them through the same Player contract", () => {
    const project = branching();
    const configured = {
      ...project,
      settings: withPlatformSettings(project.settings, "android", {
        display: { designWidth: 1080, designHeight: 1920, orientation: "portrait" },
        input: { keyboardAdvance: false }
      })
    };
    const reopened = loadProject(saveProject(configured));
    const { container } = render(<PlayerShell project={reopened} platform="android" />);
    expect(container.querySelector("main")).toHaveAttribute("data-settings-orientation", "portrait");
    expect(container.querySelector("main")).toHaveAttribute("data-settings-input-keyboard", "false");
    expect(container.querySelector("main")).toHaveStyle({ "--gal-stage-aspect": "1080 / 1920" });
  });

  it("saves and loads a manual Host slot through the formal Session Save bridge", async () => {
    const records = new Map<string, WorldPlayerSaveSlotV3>();
    const previews = new Map<string, Blob>();
    const store: WorldPlayerSaveStoreV3 = {
      version: "3.0.0",
      backend: "memory-test",
      async list(projectId) { return [...records.values()].filter((slot) => slot.projectId === projectId); },
      async read(projectId, slotId) { return records.get(`${projectId}\0${slotId}`) ?? null; },
      async readPreview(projectId, slotId) { return previews.get(`${projectId}\0${slotId}`) ?? null; },
      async write(slot, preview) {
        if (slot.schemaVersion !== 3) throw new Error("unexpected legacy write");
        records.set(`${slot.projectId}\0${slot.slotId}`, slot);
        if (preview === undefined) previews.delete(`${slot.projectId}\0${slot.slotId}`);
        else previews.set(`${slot.projectId}\0${slot.slotId}`, preview);
      }
    };
    const { container } = render(<PlayerShell project={branching()} saveStore={store} now={() => 1_788_000_000_000} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-choice");
    fireEvent.click(screen.getByRole("button", { name: "存读档" }));
    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]!);
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-save-operation", "saved"));
    expect(screen.getByText(/Main \/ Fork/u)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Left/u }));
    expect(container.querySelector("main")).toHaveAttribute("data-player-status", "presenting");
    fireEvent.click(screen.getAllByRole("button", { name: "读取" })[0]!);
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-choice"));
    expect(container.querySelector("main")).toHaveAttribute("data-save-operation", "loaded");

    const stored = records.get("golden_branching\0manual-1")!;
    records.set("golden_branching\0manual-1", { ...stored, sceneId: "tampered-scene" });
    fireEvent.click(screen.getByRole("button", { name: /Left/u }));
    fireEvent.click(screen.getByRole("button", { name: "存读档" }));
    fireEvent.click(screen.getAllByRole("button", { name: "读取" })[0]!);
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-save-operation", "error"));
    expect(container.querySelector("main")).toHaveAttribute("data-player-status", "presenting");
    expect(screen.getByText("存档损坏或与当前构建不兼容")).toBeInTheDocument();
  });

  it("paginates twelve manual slots six at a time", () => {
    const store: WorldPlayerSaveStoreV3 = {
      version: "3.0.0",
      backend: "memory-test",
      async list() { return []; },
      async read() { return null; },
      async readPreview() { return null; },
      async write() {}
    };
    render(<PlayerShell project={branching()} saveStore={store} />);
    fireEvent.click(screen.getByRole("button", { name: "存读档" }));
    expect(screen.getByText("槽位 1")).toBeInTheDocument();
    expect(screen.getByText("槽位 6")).toBeInTheDocument();
    expect(screen.queryByText("槽位 7")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument();
    expect(screen.getByText("槽位 7")).toBeInTheDocument();
    expect(screen.getByText("槽位 12")).toBeInTheDocument();
    expect(screen.queryByText("槽位 6")).not.toBeInTheDocument();
  });

  it("requires explicit overwrite confirmation and commits Host-composited preview metadata", async () => {
    const records = new Map<string, WorldPlayerSaveSlotV3>();
    const writes: Array<{ readonly slot: WorldPlayerSaveSlotV3; readonly preview?: Blob }> = [];
    const store: WorldPlayerSaveStoreV3 = {
      version: "3.0.0",
      backend: "memory-test",
      async list(projectId) { return [...records.values()].filter((slot) => slot.projectId === projectId); },
      async read(projectId, slotId) { return records.get(`${projectId}\0${slotId}`) ?? null; },
      async readPreview() { return null; },
      async write(slot, preview) {
        if (slot.schemaVersion !== 3) throw new Error("unexpected legacy write");
        records.set(`${slot.projectId}\0${slot.slotId}`, slot);
        writes.push({ slot, ...(preview === undefined ? {} : { preview }) });
      }
    };
    const preview = new NodeBlob([new Uint8Array([1, 2, 3])], { type: "image/webp" }) as Blob;
    const previewCapture = { version: "1.0.0" as const, owner: "player-host-compositor" as const, capture: vi.fn(async () => ({ blob: preview, width: 320, height: 180 })) };
    const { container } = render(<PlayerShell project={branching()} saveStore={store} previewCapture={previewCapture} now={() => 1_788_000_000_000} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.click(screen.getByRole("button", { name: "存读档" }));
    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]!);
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-save-operation", "saved"));
    expect(writes.filter((write) => write.slot.kind === "manual")).toHaveLength(1);
    expect(writes.find((write) => write.slot.kind === "manual")).toMatchObject({
      slot: { schemaVersion: 3, checkpointStepId: null, sceneId: "branch_start", sceneTitle: "Fork", route: null, customMetadata: {}, preview: { status: "available", mimeType: "image/webp", width: 320, height: 180, byteLength: 3, sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81" } },
      preview
    });

    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]!);
    expect(screen.getByRole("button", { name: "确认覆盖" })).toBeInTheDocument();
    expect(writes.filter((write) => write.slot.kind === "manual")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "确认覆盖" }));
    await waitFor(() => expect(writes.filter((write) => write.slot.kind === "manual")).toHaveLength(2));
    expect(previewCapture.capture).toHaveBeenCalledWith(expect.objectContaining({ maximumWidth: 512, maximumHeight: 512, maximumBytes: 524288 }));
  });

  it("keeps a valid v3 save when preview capture fails", async () => {
    const writes: WorldPlayerSaveSlotV3[] = [];
    const store: WorldPlayerSaveStoreV3 = {
      version: "3.0.0",
      backend: "memory-test",
      async list() { return writes; },
      async read() { return null; },
      async readPreview() { return null; },
      async write(slot, preview) {
        if (slot.schemaVersion !== 3 || preview !== undefined) throw new Error("unexpected write");
        writes.push(slot);
      }
    };
    const previewCapture = { version: "1.0.0" as const, owner: "player-host-compositor" as const, async capture(): Promise<never> { throw new Error("capture failed"); } };
    const { container } = render(<PlayerShell project={branching()} saveStore={store} previewCapture={previewCapture} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.click(screen.getByRole("button", { name: "存读档" }));
    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]!);
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-save-operation", "saved"));
    expect(writes[0]?.preview).toEqual({ status: "unavailable", reason: "capture-failed" });
    expect(screen.getByText(/预览不可用/u)).toBeInTheDocument();
  });

  it("writes one automatic save per scene identity and exposes the five-slot view", async () => {
    const records = new Map<string, WorldPlayerSaveSlotV3>();
    let clock = 1_788_000_000_000;
    const store: WorldPlayerSaveStoreV3 = {
      version: "3.0.0", backend: "memory-test",
      async list(projectId) { return [...records.values()].filter((slot) => slot.projectId === projectId); },
      async read(projectId, slotId) { return records.get(`${projectId}\0${slotId}`) ?? null; },
      async readPreview() { return null; },
      async write(value) { if (value.schemaVersion !== 3) throw new Error("legacy"); records.set(`${value.projectId}\0${value.slotId}`, value); }
    };
    render(<PlayerShell project={branching()} saveStore={store} now={() => clock++} />);
    expect(screen.getByRole("button", { name: "快速保存" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    await waitFor(() => expect(records.get("golden_branching\0auto-1")).toMatchObject({ kind: "auto", sceneId: "branch_start", presentationKind: "choice" }));
    fireEvent.click(screen.getByRole("button", { name: /Left/u }));
    await waitFor(() => expect(records.get("golden_branching\0auto-2")).toMatchObject({ kind: "auto", sceneId: "branch_left" }));
    fireEvent.click(screen.getByRole("button", { name: "继续下一句" }));
    fireEvent.click(screen.getByRole("button", { name: "继续下一句" }));
    await Promise.resolve();
    expect([...records.values()].filter((slot) => slot.kind === "auto")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "存读档" }));
    fireEvent.click(screen.getByRole("button", { name: "自动" }));
    expect(screen.getByText("自动 1")).toBeInTheDocument();
    expect(screen.getByText("自动 5")).toBeInTheDocument();
  });

  it("replaces and loads the fixed quick slot without overwrite confirmation", async () => {
    const records = new Map<string, WorldPlayerSaveSlotV3>();
    const store: WorldPlayerSaveStoreV3 = {
      version: "3.0.0", backend: "memory-test",
      async list(projectId) { return [...records.values()].filter((slot) => slot.projectId === projectId); },
      async read(projectId, slotId) { return records.get(`${projectId}\0${slotId}`) ?? null; },
      async readPreview() { return null; },
      async write(value) { if (value.schemaVersion !== 3) throw new Error("legacy"); records.set(`${value.projectId}\0${value.slotId}`, value); }
    };
    const { container } = render(<PlayerShell project={branching()} saveStore={store} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    await waitFor(() => expect(records.has("golden_branching\0auto-1")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "快速保存" }));
    await waitFor(() => expect(records.get("golden_branching\0quick-1")).toMatchObject({ kind: "quick", sceneId: "branch_start" }));
    fireEvent.click(screen.getByRole("button", { name: /Left/u }));
    expect(container.querySelector("main")).toHaveAttribute("data-player-status", "presenting");
    fireEvent.click(screen.getByRole("button", { name: "快速读取" }));
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-choice"));
    expect(container.querySelector("main")).toHaveAttribute("data-save-operation", "loaded");
  });

  it("persists, lists, and loads an exact build-authored checkpoint without stopping presentation", async () => {
    const records = new Map<string, WorldPlayerSaveSlotV3>();
    let clock = 1_788_000_000_000;
    const store: WorldPlayerSaveStoreV3 = {
      version: "3.0.0", backend: "memory-test",
      async list(projectId) { return [...records.values()].filter((slot) => slot.projectId === projectId); },
      async read(projectId, slotId) { return records.get(`${projectId}\0${slotId}`) ?? null; },
      async readPreview() { return null; },
      async write(value) { if (value.schemaVersion !== 3) throw new Error("legacy"); records.set(`${value.projectId}\0${value.slotId}`, value); }
    };
    const { container } = render(<PlayerShell project={branchingWithCheckpoint()} saveStore={store} now={() => clock++} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-choice");
    await waitFor(() => expect(records.get("golden_branching\0checkpoint-1")).toMatchObject({
      schemaVersion: 3, kind: "checkpoint", checkpointStepId: "checkpoint_fork", sceneId: "branch_start", presentationKind: "choice"
    }));

    fireEvent.click(screen.getByRole("button", { name: "存读档" }));
    fireEvent.click(screen.getByRole("button", { name: "检查点" }));
    expect(screen.getByText("检查点 1")).toBeInTheDocument();
    expect(screen.getByText(/Fork · checkpoint_fork/u)).toBeInTheDocument();
    expect(screen.getByText("检查点 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Left/u }));
    expect(container.querySelector("main")).toHaveAttribute("data-player-status", "presenting");
    fireEvent.click(screen.getAllByRole("button", { name: "读取" })[0]!);
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-choice"));
    expect(container.querySelector("main")).toHaveAttribute("data-save-operation", "loaded");
    expect([...records.values()].filter((slot) => slot.kind === "checkpoint")).toHaveLength(1);
  });

  it("writes isolated recovery boundaries and restores them only after an explicit player decision", async () => {
    const saves = new Map<string, WorldPlayerSaveSlotV3>();
    let recovery: WorldPlayerRecoveryRecordV1 | null = null;
    let clock = 1_788_000_000_000;
    const saveStore: WorldPlayerSaveStoreV3 = {
      version: "3.0.0", backend: "memory-save",
      async list(projectId) { return [...saves.values()].filter((slot) => slot.projectId === projectId); },
      async read(projectId, slotId) { return saves.get(`${projectId}\0${slotId}`) ?? null; },
      async readPreview() { return null; },
      async write(value) { if (value.schemaVersion !== 3) throw new Error("legacy"); saves.set(`${value.projectId}\0${value.slotId}`, value); }
    };
    const recoveryStore: WorldPlayerRecoveryStoreV1 = {
      version: "1.0.0", backend: "memory-recovery",
      async read(projectId) { return recovery?.projectId === projectId ? recovery : null; },
      async write(value) { recovery = value; },
      async clear() { recovery = null; }
    };
    const first = render(<PlayerShell project={branching()} saveStore={saveStore} recoveryStore={recoveryStore} now={() => clock++} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    await waitFor(() => expect(recovery).toMatchObject({ format: "world.player-recovery", sceneId: "branch_start", presentationKind: "choice" }));
    fireEvent.click(screen.getByRole("button", { name: /Left/u }));
    await waitFor(() => expect(recovery).toMatchObject({ sceneId: "branch_left", presentationKind: "dialogue" }));
    first.unmount();

    const second = render(<PlayerShell project={branching()} saveStore={saveStore} recoveryStore={recoveryStore} now={() => clock++} />);
    expect(second.container.querySelector("main")).toHaveAttribute("data-player-status", "title");
    expect(await screen.findByText("发现上次未完成的安全进度")).toBeInTheDocument();
    expect(second.container.querySelector("main")).toHaveAttribute("data-recovery-operation", "available");
    fireEvent.click(screen.getByRole("button", { name: "恢复上次进度" }));
    await waitFor(() => expect(second.container.querySelector("main")).toHaveAttribute("data-player-status", "presenting"));
    expect(screen.getByText("The quiet route.")).toBeInTheDocument();
    expect(second.container.querySelector("main")).toHaveAttribute("data-recovery-operation", "loaded");
  });

  it("isolates corrupt recovery and lets the player clear it without touching formal slots", async () => {
    const clear = vi.fn(async () => undefined);
    const recoveryStore: WorldPlayerRecoveryStoreV1 = {
      version: "1.0.0", backend: "memory-recovery",
      async read() { throw new Error("corrupt"); },
      async write() {},
      clear
    };
    const saveStore: WorldPlayerSaveStoreV3 = {
      version: "3.0.0", backend: "memory-save",
      async list() { return []; }, async read() { return null; }, async readPreview() { return null; }, async write() {}
    };
    const { container } = render(<PlayerShell project={branching()} saveStore={saveStore} recoveryStore={recoveryStore} />);
    expect(await screen.findByText("恢复记录损坏，已与正式存档隔离")).toBeInTheDocument();
    expect(container.querySelector("main")).toHaveAttribute("data-recovery-operation", "error");
    fireEvent.click(screen.getByRole("button", { name: "放弃并清除" }));
    await waitFor(() => expect(clear).toHaveBeenCalledWith("golden_branching"));
    expect(container.querySelector("main")).toHaveAttribute("data-save-operation", "idle");
  });
});
