import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadProject, migrateS0Project, type CanonicalProject, type S0Project } from "@world-studio/project-domain";
import benchmarkSource from "../../../fixtures/projects/benchmark/project.s0.json";
import { createPlayerMediaDemoV1 } from "./media-demo";
import { PlayerShell } from "./PlayerShell";

const source = benchmarkSource as S0Project & { readonly variables?: CanonicalProject["variables"]["variables"] };
const migrated = loadProject(migrateS0Project(source).files);
const project: CanonicalProject = { ...migrated, variables: { schemaVersion: 1, variables: source.variables ?? [] } };
const mediaDemo = new URLSearchParams(window.location.search).get("demo") === "media" ? createPlayerMediaDemoV1() : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlayerShell project={mediaDemo?.project ?? project} mediaAssets={mediaDemo?.mediaAssets ?? []} />
  </StrictMode>
);
