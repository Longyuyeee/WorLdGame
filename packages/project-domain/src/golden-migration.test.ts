// @vitest-environment node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, saveProject, semanticHash, type S0Project } from "./index";

const goldenIds = ["tiny", "branching", "media", "cjk", "recovery", "size", "benchmark"] as const;

describe("N01 Golden to Canonical Project migration", () => {
  it.each(goldenIds)("migrates %s without changing the second pass", async (goldenId) => {
    const source = JSON.parse(await readFile(join(process.cwd(), "fixtures", "projects", goldenId, "project.s0.json"), "utf8")) as S0Project;
    const first = migrateS0Project(source);
    const loaded = loadProject(first.files);
    const second = migrateS0Project(saveProject(loaded));
    expect(second.status).toBe("already-current");
    expect(second.files).toEqual(first.files);
    expect(semanticHash(loadProject(second.files))).toBe(semanticHash(loaded));
  });
});
