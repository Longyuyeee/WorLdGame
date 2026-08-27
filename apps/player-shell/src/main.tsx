import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadProject, migrateS0Project, type CanonicalProject, type S0Project } from "@world-studio/project-domain";
import benchmarkSource from "../../../fixtures/projects/benchmark/project.s0.json";
import branchingSource from "../../../fixtures/projects/branching/project.s0.json";
import { createPlayerMediaDemoV1, createPlayerMediaMultichannelDemoV1 } from "./media-demo";
import { PlayerShell } from "./PlayerShell";

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
  return <PlayerShell project={demo.project} mediaAssets={assets} onRetryMedia={() => setAvailable(true)} />;
}

function LifecycleDemo() {
  const [showBenchmark, setShowBenchmark] = useState(false);
  return <>
    <button className="player-demo-switch" type="button" onClick={() => setShowBenchmark((current) => !current)}>切换工程身份</button>
    <PlayerShell project={showBenchmark ? project : inputDemoProject} />
  </>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {demoName === "recovery"
      ? <RecoveryDemo />
      : demoName === "lifecycle"
        ? <LifecycleDemo />
      : <PlayerShell project={demoName === "input" ? inputDemoProject : mediaDemo?.project ?? project} mediaAssets={mediaDemo?.mediaAssets ?? []} />}
  </StrictMode>
);
