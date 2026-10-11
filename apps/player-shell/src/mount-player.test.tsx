import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadProject, migrateS0Project, type CanonicalProject, type S0Project } from "@world-studio/project-domain";
import { mountWorldPlayerV1, WORLD_PLAYER_EMBED_API_VERSION, type WorldPlayerHandleV1 } from "@world-studio/player-shell";
import { createPlayerMediaDemoV1, createPlayerMediaMultichannelDemoV1 } from "./media-demo";

const mounted: WorldPlayerHandleV1[] = [];
const containers: HTMLElement[] = [];

afterEach(() => {
  for (const handle of mounted.splice(0)) handle.unmount();
  for (const container of containers.splice(0)) container.remove();
  vi.restoreAllMocks();
});

function branching(): CanonicalProject {
  const source = JSON.parse(readFileSync(join(process.cwd(), "fixtures/projects/branching/project.s0.json"), "utf8")) as S0Project;
  return loadProject(migrateS0Project(source).files);
}

function connectedContainer(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  return container;
}

function mount(container = connectedContainer(), project = branching()): WorldPlayerHandleV1 {
  const handle = mountWorldPlayerV1(container, { project });
  mounted.push(handle);
  return handle;
}

describe("N50-E6 versioned Player host embedding API", () => {
  it("reports actual voice waiting as active and suspends it through the host API", async () => {
    const demo = createPlayerMediaMultichannelDemoV1();
    const container = connectedContainer();
    const handle = mountWorldPlayerV1(container, { project: demo.project, mediaAssets: demo.mediaAssets });
    mounted.push(handle);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    fireEvent.click(screen.getByRole("button", { name: "继续下一句" }));
    fireEvent.click(screen.getByRole("button", { name: "自动播放" }));
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-auto-playback", "waiting-voice"));
    expect(screen.getByText("等待语音结束，可关闭自动播放切回手动")).toBeVisible();
    expect(handle.getObservation().playback.active).toBe(true);
    handle.setHostActivity("suspended");
    expect(handle.getObservation().playback.active).toBe(false);
  });
  it("suspends synchronously for freeze and keeps host/visibility restrictions after resume", () => {
    const visibility=vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
    const handle=mount();
    fireEvent.click(screen.getByRole("button",{name:/开始故事/u}));
    fireEvent(document,new Event("freeze"));expect(handle.getObservation().hostActivity).toBe("suspended");
    handle.setHostActivity("active");expect(handle.getObservation().hostActivity).toBe("suspended");
    visibility.mockReturnValue("hidden");fireEvent(document,new Event("resume"));expect(handle.getObservation().hostActivity).toBe("suspended");
    visibility.mockReturnValue("visible");fireEvent(document,new Event("visibilitychange"));expect(handle.getObservation().hostActivity).toBe("active");
    fireEvent(document,new Event("freeze"));handle.setHostActivity("suspended");
    fireEvent(document,new Event("resume"));expect(handle.getObservation()).toMatchObject({hostActivity:"suspended",status:"waiting-choice"});
    handle.unmount();fireEvent(document,new Event("freeze"));fireEvent(document,new Event("resume"));
  });
  it("treats real document visibility as a ceiling even with an explicit active host", () => {
    const visibility=vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
    const handle=mount();
    fireEvent.click(screen.getByRole("button",{name:/开始故事/u}));
    visibility.mockReturnValue("hidden");fireEvent(document,new Event("visibilitychange"));
    expect(handle.getObservation()).toMatchObject({hostActivity:"suspended",status:"waiting-choice"});
    handle.setHostActivity("active");expect(handle.getObservation().hostActivity).toBe("suspended");
    handle.setHostActivity("suspended");visibility.mockReturnValue("visible");fireEvent(document,new Event("visibilitychange"));
    expect(handle.getObservation().hostActivity).toBe("suspended");
    handle.setHostActivity("active");expect(handle.getObservation()).toMatchObject({hostActivity:"active",status:"waiting-choice"});
  });
  it("mounts the formal Core and exposes a stable observation contract", () => {
    const handle = mount();
    expect(handle.apiVersion).toBe(WORLD_PLAYER_EMBED_API_VERSION);
    expect(handle.getObservation()).toEqual({
      schemaVersion: 1,
      embedApiVersion: "1.3.0",
      memoryPressure: "idle",
      mounted: true,
      status: "title",
      hostActivity: "active",
      settingsPlatform: "web",
      playerCoreVersion: "0.5.0",
      compilerVersion: "0.2.0",
      runtimeVersion: "0.6.0",
      runtimeHostVersion: "0.1.0",
      saveStoreBackend: "unavailable",
      saveStoreVersion: null,
      playback: {
        schemaVersion: 1,
        mode: "normal",
        activation: null,
        speed: "normal",
        active: false,
        stopReason: null
      }
    });
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(handle.getObservation().status).toBe("waiting-choice");
    expect(handle.getObservation().playback).toMatchObject({ mode: "normal", active: false });
  });

  it("updates activity without losing progress and resets only for a changed project identity", () => {
    const original = branching();
    const handle = mount(connectedContainer(), original);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
    expect(handle.getObservation().status).toBe("waiting-choice");

    handle.setHostActivity("suspended");
    expect(handle.getObservation()).toMatchObject({ status: "waiting-choice", hostActivity: "suspended" });
    handle.setHostActivity("active");
    handle.setProject({ ...original });
    expect(handle.getObservation()).toMatchObject({ status: "waiting-choice", hostActivity: "active" });

    const replacement = createPlayerMediaDemoV1();
    handle.setProject(replacement.project);
    handle.setMediaAssets(replacement.mediaAssets);
    expect(handle.getObservation().status).toBe("title");
  });

  it("unmounts idempotently, rejects disposed operations, and permits a fresh remount", () => {
    const container = connectedContainer();
    const first = mount(container);
    first.unmount();
    expect(container).toBeEmptyDOMElement();
    expect(() => first.getObservation()).toThrow("WORLD_PLAYER_HOST_DISPOSED");
    expect(() => first.setHostActivity("active")).toThrow("WORLD_PLAYER_HOST_DISPOSED");
    expect(() => first.unmount()).not.toThrow();

    const second = mount(container);
    expect(second.getObservation().status).toBe("title");
  });

  it("fails closed for detached containers and duplicate ownership", () => {
    const detached = document.createElement("div");
    expect(() => mountWorldPlayerV1(detached, { project: branching() })).toThrow("WORLD_PLAYER_HOST_CONTAINER_DETACHED");

    const container = connectedContainer();
    mount(container);
    expect(() => mountWorldPlayerV1(container, { project: branching() })).toThrow("WORLD_PLAYER_HOST_ALREADY_MOUNTED");
  });
});
