import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadProject, migrateS0Project, type CanonicalProject, type S0Project } from "@world-studio/project-domain";
import benchmarkSource from "../../../fixtures/projects/benchmark/project.s0.json";
import { createPlayerMediaDemoV1, createPlayerMediaMultichannelDemoV1 } from "./media-demo";
import { PlayerShell } from "./PlayerShell";

const source = benchmarkSource as S0Project & { readonly variables?: CanonicalProject["variables"]["variables"] };
const migrated = loadProject(migrateS0Project(source).files);
const project: CanonicalProject = { ...migrated, variables: { schemaVersion: 1, variables: source.variables ?? [] } };
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {demoName === "recovery"
      ? <RecoveryDemo />
      : <PlayerShell project={mediaDemo?.project ?? project} mediaAssets={mediaDemo?.mediaAssets ?? []} />}
  </StrictMode>
);
