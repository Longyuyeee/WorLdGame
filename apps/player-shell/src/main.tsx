import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { withPlatformSettings } from "@world-studio/gal-settings";
import { loadProject, migrateS0Project, type CanonicalProject, type S0Project } from "@world-studio/project-domain";
import benchmarkSource from "../../../fixtures/projects/benchmark/project.s0.json";
import branchingSource from "../../../fixtures/projects/branching/project.s0.json";
import { createPlayerMediaDemoV1, createPlayerMediaMultichannelDemoV1 } from "./media-demo";
import { WebPlayerHost } from "./player-host";

const source = benchmarkSource as S0Project & { readonly variables?: CanonicalProject["variables"]["variables"] };
const migrated = loadProject(migrateS0Project(source).files);
const project: CanonicalProject = { ...migrated, variables: { schemaVersion: 1, variables: source.variables ?? [] } };
const branchingRaw = branchingSource as S0Project & { readonly variables?: CanonicalProject["variables"]["variables"] };
const branchingMigrated = loadProject(migrateS0Project(branchingRaw).files);
const inputDemoProject: CanonicalProject = { ...branchingMigrated, variables: { schemaVersion: 1, variables: branchingRaw.variables ?? [] } };
const demoName = new URLSearchParams(window.location.search).get("demo");
const mediaDemo = demoName === "media" || demoName === "recovery" ? createPlayerMediaDemoV1()
  : demoName === "multi" ? createPlayerMediaMultichannelDemoV1()
    : null;

function RecoveryDemo() {
  const demo = mediaDemo!;
  const [available, setAvailable] = useState(false);
  const assets = available ? demo.mediaAssets : demo.mediaAssets.filter((asset) => asset.assetId !== "media_actor_sprite");
  return <WebPlayerHost project={demo.project} mediaAssets={assets} onRetryMedia={() => setAvailable(true)} />;
}

function LifecycleDemo() {
  const [showBenchmark, setShowBenchmark] = useState(false);
  return <>
    <button className="player-demo-switch" type="button" onClick={() => setShowBenchmark((current) => !current)}>切换工程身份</button>
    <WebPlayerHost project={showBenchmark ? project : inputDemoProject} />
  </>;
}

function HostLifecycleDemo() {
  const demo = createPlayerMediaMultichannelDemoV1();
  const [mounted, setMounted] = useState(true);
  const [suspended, setSuspended] = useState(false);
  return <>
    <div className="player-demo-controls" aria-label="Web 宿主生命周期控制">
      <button type="button" onClick={() => setSuspended((current) => !current)}>{suspended ? "恢复宿主" : "暂停宿主"}</button>
      <button type="button" onClick={() => setMounted((current) => !current)}>{mounted ? "卸载 Player" : "重新挂载 Player"}</button>
    </div>
    {mounted
      ? <WebPlayerHost project={demo.project} mediaAssets={demo.mediaAssets} activityOverride={suspended ? "suspended" : "active"} />
      : <main className="player-host-unmounted" data-player-mounted="false"><strong>Player 已由宿主卸载</strong><span>正式 Core 与媒体节点均已释放</span></main>}
  </>;
}

function SettingsApplicationDemo() {
  const [applied, setApplied] = useState(false);
  const configured = applied ? {
    ...inputDemoProject,
    settings: withPlatformSettings(inputDemoProject.settings, "web", {
      display: { designWidth: 1080, designHeight: 1920, orientation: "portrait", safeArea: "none", quality: "low" },
      text: { charactersPerSecond: 12, minimumDisplayMilliseconds: 900, punctuationDelayMilliseconds: 240, fontScale: 1.4, messageWindowOpacity: 0.45, revealMode: "instant", lineHeight: 2, letterSpacingEm: 0.08 },
      accessibility: { highContrast: true, reduceMotion: true, reduceFlashing: true },
      advance: { allowHold: false, waitForVoice: false },
      stage: { defaultDurationMilliseconds: 720, defaultEasing: "ease-out" },
      choice: { showOptionNumbers: false, layout: "responsive-grid" },
      ui: { defaultTextboxTemplate: "bubble", showInputHints: false },
      audio: { master: 0.6, bgm: 0.5, voice: 0.7, sfx: 0.4, ambient: 0.3, ui: 0.2, voiceDucking: 0.25, resumeAfterInterruption: false },
      input: { pointerAdvance: false, keyboardAdvance: false, touchAdvance: false, gamepadAdvance: false }
    })
  } : inputDemoProject;
  return <>
    <button className="player-demo-switch" type="button" onClick={() => setApplied((current) => !current)}>{applied ? "恢复默认设置" : "热应用运行设置"}</button>
    <WebPlayerHost project={configured} />
  </>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {demoName === "recovery"
      ? <RecoveryDemo />
      : demoName === "lifecycle"
        ? <LifecycleDemo />
      : demoName === "host"
          ? <HostLifecycleDemo />
          : demoName === "settings"
            ? <SettingsApplicationDemo />
          : <WebPlayerHost project={demoName === "input" ? inputDemoProject : mediaDemo?.project ?? project} mediaAssets={mediaDemo?.mediaAssets ?? []} />}
  </StrictMode>
);
