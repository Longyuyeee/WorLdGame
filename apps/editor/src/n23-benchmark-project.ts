import type { StoryProject } from "@world-studio/story-core";
import benchmarkProjectJson from "../../../fixtures/projects/benchmark/project.s0.json?raw";

export function loadN23BenchmarkProject(): StoryProject {
  const project = JSON.parse(benchmarkProjectJson) as StoryProject;
  return structuredClone(project);
}
