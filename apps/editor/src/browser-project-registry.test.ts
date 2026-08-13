import { describe, expect, it } from "vitest";
import type { RecentProject } from "@world-studio/project-domain";
import { BrowserRecentProjectStore } from "./browser-project-registry";

describe("BrowserRecentProjectStore", () => {
  it("persists only reference metadata and tolerates damaged metadata", async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const store = new BrowserRecentProjectStore(storage);
    const items: readonly RecentProject[] = [{ reference: { referenceId: "opfs_alpha", hostKind: "web-opfs", displayLocation: "alpha", permissionKey: "directory:opfs_alpha" }, projectId: "project_alpha", title: "Alpha", lastOpenedAtMs: 1 }];
    await store.save(items);
    expect(await store.load()).toEqual(items);
    expect(JSON.stringify([...values])).not.toContain("chapterPaths");
    storage.setItem("world-studio:recent-projects:v1", "not-json");
    expect(await store.load()).toEqual([]);
  });
});
