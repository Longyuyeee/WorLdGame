import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { withPlatformSettings, withProjectSettings } from "@world-studio/gal-settings";
import { loadProject, migrateS0Project, type CanonicalProject, type S0Project } from "@world-studio/project-domain";
import benchmarkSource from "../../../fixtures/projects/benchmark/project.s0.json";
import branchingSource from "../../../fixtures/projects/branching/project.s0.json";
import cjkSource from "../../../fixtures/projects/cjk/project.s0.json";
import { createPlayerLocalizedMediaDemoV1, createPlayerMediaDemoV1, createPlayerMediaMultichannelDemoV1, createPlayerVideoDemoV1 } from "./media-demo";
import { WebPlayerHost } from "./player-host";

const source = benchmarkSource as S0Project & { readonly variables?: CanonicalProject["variables"]["variables"] };
const migrated = loadProject(migrateS0Project(source).files);
const project: CanonicalProject = { ...migrated, variables: { schemaVersion: 1, variables: source.variables ?? [] } };
const branchingRaw = branchingSource as S0Project & { readonly variables?: CanonicalProject["variables"]["variables"] };
const branchingMigrated = loadProject(migrateS0Project(branchingRaw).files);
const inputDemoProject: CanonicalProject = { ...branchingMigrated, variables: { schemaVersion: 1, variables: branchingRaw.variables ?? [] } };
const localizationDemoProject: CanonicalProject = {
  ...inputDemoProject,
  manifest: { ...inputDemoProject.manifest, projectId: "player_localization_demo", title: "WorLd Player · Localization", defaultLocale: "en" },
  localization: {
    schemaVersion: 1,
    locales: [{
      id: "locale_zh_hans",
      locale: "zh-Hans",
      sourceLocale: "en",
      entries: [
        { key: "branch_prompt", sourceText: "Choose a route", translation: "选择路线", status: "reviewed" },
        { key: "branch_left_option", sourceText: "Left", translation: "左侧", status: "reviewed" },
        { key: "branch_left_text", sourceText: "The quiet route.", translation: "安静的路线。", status: "reviewed" }
      ]
    }]
  }
};
const cjkRaw = cjkSource as S0Project & { readonly variables?: CanonicalProject["variables"]["variables"] };
const cjkMigrated = loadProject(migrateS0Project(cjkRaw).files);
const cjkScene = cjkMigrated.scripts.cjk_start!;
const cjkTypographyProject: CanonicalProject = {
  ...cjkMigrated,
  manifest: { ...cjkMigrated.manifest, projectId: "player_cjk_typography_demo", title: "WorLd Player · CJK Typography", defaultLocale: "ja" },
  assets: { ...cjkMigrated.assets, assets: [{ assetId: "font_ja_missing", kind: "font", displayName: "Project Japanese", mimeType: "font/woff2", fontFamily: "Project Japanese", locales: ["ja"] }] },
  settings: withProjectSettings(cjkMigrated.settings, { text: { revealMode: "instant", lineHeight: 1.9 } }),
  scripts: { ...cjkMigrated.scripts, cjk_start: { ...cjkScene, statements: [
    { id: "cjk_ruby", kind: "narration", textId: "cjk_ruby_text", text: "黄昏の｜放送室《ほうそうしつ》で、彼女は「まだ帰らない」と静かに言った。窓の向こうでは古い電車がゆっくり動き、これはスマートフォンでも句読点を不自然な行頭へ追い出さずに読むための長い文章です。" },
    { id: "cjk_end", kind: "end", endingName: "再会" }
  ] } }
};
const cjkTypographyAssets = [{ assetId: "font_ja_missing", displayName: "Project Japanese", mimeType: "font/woff2", url: "data:font/woff2;base64,AA==" }] as const;
const historyDesktopDemoProject: CanonicalProject = {
  ...inputDemoProject,
  manifest: { ...inputDemoProject.manifest, projectId: "player_history_desktop", title: "WorLd Player · History Desktop" }
};
const historyMobileDemoProject: CanonicalProject = {
  ...inputDemoProject,
  manifest: { ...inputDemoProject.manifest, projectId: "player_history_mobile", title: "WorLd Player · History Mobile" }
};
const historyBlockedDemoProject: CanonicalProject = {
  ...inputDemoProject,
  manifest: { ...inputDemoProject.manifest, projectId: "player_history_blocked", title: "WorLd Player · History Forward Blocked" },
  settings: withProjectSettings(inputDemoProject.settings, { history: { allowForwardAfterBack: false } })
};
const stopPointSceneId = inputDemoProject.manifest.entrySceneId;
const stopPointDemoProject: CanonicalProject = {
  ...inputDemoProject,
  settings: withProjectSettings(inputDemoProject.settings, { text: { revealMode: "instant" } }),
  scripts: {
    ...inputDemoProject.scripts,
    [stopPointSceneId]: {
      ...inputDemoProject.scripts[stopPointSceneId]!,
      statements: [
        { id: "stop_demo_a", kind: "narration", textId: "stop_demo_a_text", text: "Before the authored stop." },
        { id: "stop_demo_b", kind: "narration", textId: "stop_demo_b_text", text: "Build-authored Stop Point reached.", playerStopPoint: true },
        { id: "stop_demo_end", kind: "end", endingName: "Stop Point was bypassed" }
      ]
    }
  }
};
const demoName = new URLSearchParams(window.location.search).get("demo");
const mediaDemo = demoName === "media" || demoName === "recovery" ? createPlayerMediaDemoV1()
  : demoName === "multi" ? createPlayerMediaMultichannelDemoV1()
    : demoName === "localized-media" ? createPlayerLocalizedMediaDemoV1()
    : null;
const historyBarrierDemo = demoName === "history-barrier" ? (() => {
  const demo = createPlayerMediaDemoV1();
  const scene = demo.project.scripts.media_stage!;
  return {
    ...demo,
    project: {
      ...demo.project,
      manifest: { ...demo.project.manifest, projectId: "player_history_barrier", title: "WorLd Player · History Barrier" },
      scripts: { ...demo.project.scripts, media_stage: { ...scene, statements: [
        { id: "published_background", kind: "direction" as const, command: "background", summary: "asset=media_sunset action=set effectPolicy=barrier descriptorId=published-background barrierReason=Published_content_cannot_be_reversed." },
        { id: "after_publish", kind: "narration" as const, textId: "after_publish_text", text: "After publishing" },
        { id: "after_publish_end", kind: "end" as const, endingName: "Done" }
      ] } }
    }
  };
})() : null;

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

async function createGeneratedVideoUrl(): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  if (context === null || typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") throw new Error("VIDEO_DEMO_CAPTURE_UNAVAILABLE");
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm";
  const stream = canvas.captureStream(12);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (event) => { if (event.data.size > 0) chunks.push(event.data); });
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
    recorder.addEventListener("error", () => reject(new Error("VIDEO_DEMO_RECORD_FAILED")), { once: true });
  });
  recorder.start();
  const startedAt = performance.now();
  await new Promise<void>((resolve) => {
    const draw = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 6000);
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, `hsl(${260 + progress * 50} 72% 22%)`);
      gradient.addColorStop(1, `hsl(${185 + progress * 35} 78% 28%)`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(255,255,255,.92)";
      context.font = "700 34px system-ui";
      context.textAlign = "center";
      context.fillText("WorLd Player · VIDEO", canvas.width / 2, canvas.height / 2);
      context.fillStyle = "rgba(255,255,255,.55)";
      context.fillRect(80, 235, 480 * progress, 6);
      if (progress >= 1) resolve(); else requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  return URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
}

function VideoDemo() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [suspended, setSuspended] = useState(false);
  useEffect(() => {
    let disposed = false;
    let created: string | null = null;
    void createGeneratedVideoUrl().then((url) => {
      created = url;
      if (disposed) URL.revokeObjectURL(url); else setVideoUrl(url);
    }).catch(() => { if (!disposed) setError(true); });
    return () => {
      disposed = true;
      if (created !== null) URL.revokeObjectURL(created);
    };
  }, []);
  if (error) return <main className="player-host-unmounted" data-video-demo="error"><strong>Video demo unavailable</strong></main>;
  if (videoUrl === null) return <main className="player-host-unmounted" data-video-demo="generating"><strong>正在生成确定性视频资产…</strong></main>;
  const demo = createPlayerVideoDemoV1(videoUrl);
  const configured = { ...demo.project, settings: withProjectSettings(demo.project.settings, { text: { revealMode: "instant" } }) };
  return <>
    <div className="player-demo-controls" aria-label="视频宿主生命周期控制">
      <button type="button" onClick={() => setSuspended((current) => !current)}>{suspended ? "恢复视频宿主" : "暂停视频宿主"}</button>
    </div>
    <WebPlayerHost project={configured} mediaAssets={demo.mediaAssets} activityOverride={suspended ? "suspended" : "active"} />
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
          : demoName === "video"
            ? <VideoDemo />
          : demoName === "cjk-typography"
            ? <WebPlayerHost project={cjkTypographyProject} mediaAssets={cjkTypographyAssets} />
          : <WebPlayerHost project={demoName === "input" ? inputDemoProject
            : demoName === "localization" ? localizationDemoProject
            : demoName === "history-desktop" ? historyDesktopDemoProject
              : demoName === "history-mobile" ? historyMobileDemoProject
                : demoName === "history-blocked" ? historyBlockedDemoProject
                  : demoName === "history-barrier" ? historyBarrierDemo!.project
                    : demoName === "stop" ? stopPointDemoProject : mediaDemo?.project ?? project} mediaAssets={historyBarrierDemo?.mediaAssets ?? mediaDemo?.mediaAssets ?? []} />}
  </StrictMode>
);
